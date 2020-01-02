import { Injectable } from '@nestjs/common';
import { AxiosResponse, AxiosError } from 'axios';

import { HttpRequestsService } from '../core/http-requests/http-requests.service';
import { TimerService } from '../timer/timer.service';
import { TimeService } from '../time/time.service';
import { FileService } from '../file/file.service';

@Injectable()
export class ReportService {
    constructor(
        private readonly httpRequestsService: HttpRequestsService,
        private readonly timerService: TimerService,
        private readonly timeService: TimeService,
        private readonly fileService: FileService
    ) {}

    getReportExport(
        teamId: string,
        userEmails: string[],
        projectNames: string[],
        startDate: string,
        endDate: string,
        timezoneOffset: number = 0,
        durationTimeFormat: string
    ): Promise<{ path: string } | AxiosError> {
        const userWhereStatement = userEmails.length
            ? `user: {email: {_in: [${userEmails.map(userEmail => `"${userEmail}"`).join(',')}]}}`
            : '';

        const projectWhereStatement = projectNames.length
            ? `project: {
                team_id: {_eq: "${teamId}"},
                name: {_in: [${projectNames.map(projectName => `"${projectName}"`).join(',')}]}
            }`
            : `project: {team_id: {_eq: "${teamId}"}}`;

        const timerStatementArray = [
            `_or: [
            {start_datetime: {_gte: "${startDate}", _lte: "${endDate}"}},
            {end_datetime: {_gte: "${startDate}", _lte: "${endDate}"}},
            {start_datetime: {_lt: "${startDate}"}, end_datetime: {_gt: "${endDate}"}}
        ]`,
        ];

        if (userWhereStatement) {
            timerStatementArray.push(userWhereStatement);
        }

        if (projectWhereStatement) {
            timerStatementArray.push(projectWhereStatement);
        }

        const query = `{
            timer_v2(where: {${timerStatementArray.join(',')}}, order_by: {end_datetime: desc}) {
                issue
                start_datetime
                end_datetime
                project {
                    name
                }
                user {
                    email
                    username
                },
            }
        }`;

        return new Promise((resolve, reject) => {
            this.httpRequestsService.request(query).subscribe(
                (res: AxiosResponse) => {
                    const reportData = this.prepareReportData(
                        res.data,
                        startDate,
                        endDate,
                        timezoneOffset,
                        durationTimeFormat
                    );
                    const reportPath = this.generateReport(reportData, timezoneOffset);

                    return resolve({ path: reportPath });
                },
                (error: AxiosError) => reject(error)
            );
        });
    }

    private prepareReportData(
        data: any,
        startDate: string,
        endDate: string,
        timezoneOffset: number,
        durationTimeFormat: string
    ): any[] {
        const { timer_v2: timerV2 } = data;
        const timerEntriesReport = {};
        for (let i = 0, timerV2Length = timerV2.length; i < timerV2Length; i++) {
            const timerEntry = timerV2[i];
            this.timerService.limitTimeEntryByStartEndDates(timerEntry, startDate, endDate);

            const { issue, start_datetime: startDatetime, end_datetime: endDatetime, project, user } = timerEntry;
            const { name: projectName } = project;
            const { email: userEmail, username } = user;

            const uniqueTimeEntryKey = `${issue}-${projectName}-${userEmail}`;
            const previousDuration = timerEntriesReport[uniqueTimeEntryKey]
                ? timerEntriesReport[uniqueTimeEntryKey]['Time']
                : 0;
            const currentDuration =
                this.timeService.getTimestampByGivenValue(endDatetime) -
                this.timeService.getTimestampByGivenValue(startDatetime);
            timerEntriesReport[uniqueTimeEntryKey] = {
                'User name': username.replace(/,/g, ';'),
                'Project name': projectName.replace(/,/g, ';'),
                Issue: issue ? '"' + decodeURI(issue).replace(/"/g, '""') + '"' : '',
                Time: previousDuration + currentDuration,
                'Start date': this.timeService.getTimestampByGivenValue(startDatetime),
                'End date': timerEntriesReport[uniqueTimeEntryKey]
                    ? timerEntriesReport[uniqueTimeEntryKey]['End date']
                    : this.timeService.getReadableTime(endDatetime, timezoneOffset),
            };
        }

        const timerEntriesReportValues = Object.values(timerEntriesReport);
        timerEntriesReportValues.sort((a, b) => a['Start date'] - b['Start date']);
        for (let i = 0, timerEntriesReportLength = timerEntriesReportValues.length; i < timerEntriesReportLength; i++) {
            let timeEntry = timerEntriesReportValues[i];
            timeEntry['Time'] = this.timeService.getTimeDurationByGivenTimestamp(timeEntry['Time'], durationTimeFormat);
            timeEntry['Start date'] = this.timeService.getReadableTime(timeEntry['Start date'], timezoneOffset);
        }

        return timerEntriesReportValues.reverse();
    }

    private generateReport(data: any[], timezoneOffset: number): string {
        const filePath = this.fileService.saveCsvFile(
            data,
            `reports/report_${this.timeService.getReadableTime(this.timeService.getTimestamp(), timezoneOffset)}.csv`
        );

        return filePath;
    }
}
