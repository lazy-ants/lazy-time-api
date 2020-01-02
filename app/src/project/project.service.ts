import { Injectable } from '@nestjs/common';
import { AxiosResponse, AxiosError } from 'axios';
import slugify from 'slugify';

import { HttpRequestsService } from '../core/http-requests/http-requests.service';
import { TimerService } from '../timer/timer.service';
import { TimeService } from '../time/time.service';
import { TeamService } from '../team/team.service';
import { RoleCollaborationService } from '../role-collaboration/role-collaboration.service';
import { Project } from './interfaces/project.interface';

@Injectable()
export class ProjectService {
    constructor(
        private readonly httpRequestsService: HttpRequestsService,
        private readonly timerService: TimerService,
        private readonly timeService: TimeService,
        private readonly teamService: TeamService,
        private readonly roleCollaborationService: RoleCollaborationService
    ) {}

    async getProjectList(userId: string, withTimerList: boolean) {
        const currentTeamData: any = await this.teamService.getCurrentTeam(userId);
        const currentTeamId = currentTeamData.data.user_team[0].team.id;
        const isAdmin =
            currentTeamData.data.user_team[0].role_collaboration_id ===
            this.roleCollaborationService.ROLES_IDS.ROLE_ADMIN;

        const clientQueryParam = isAdmin ? `client { id, name }` : '';
        const timerWhereStatement = isAdmin ? '' : `(where: {user_id: {_eq: "${userId}"}})`;

        const query = `{
            project_v2(
                order_by: {name: asc}
                where: {
                    team_id: { _eq: "${currentTeamId}" }
                }
            ) {
                id
                name
                is_active
                project_color {
                    name
                }
                ${clientQueryParam}
                ${
                    withTimerList
                        ? `timer ${timerWhereStatement} {
                            start_datetime
                            end_datetime
                        }`
                        : ``
                }
            }
        }`;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }

    getReportsProject(
        teamId: string,
        projectName: string,
        userEmails: string[],
        startDate: string,
        endDate: string,
        durationTimeFormat: string
    ) {
        const timerStatementArray = [
            `_or: [
            {start_datetime: {_gte: "${startDate}", _lt: "${endDate}"}},
            {end_datetime: {_gte: "${startDate}", _lt: "${endDate}"}},
            {start_datetime: {_lt: "${startDate}"}, end_datetime: {_gt: "${endDate}"}}
        ]`,
        ];

        const userWhereStatement = userEmails.length
            ? `user: {email: {_in: [${userEmails.map(userEmail => `"${userEmail}"`).join(',')}]}}`
            : '';
        if (userWhereStatement) {
            timerStatementArray.push(userWhereStatement);
        }

        const timerStatementString = timerStatementArray.join(', ');
        const timerWhereStatement = timerStatementString
            ? `(where: {${timerStatementString}}, order_by: {end_datetime: desc})`
            : '(order_by: {end_datetime: desc})';

        const query = `{
            project_v2(where: {team_id: {_eq: "${teamId}"}, name: {_eq: "${projectName}"}}) {
                timer ${timerWhereStatement} {
                    issue
                    project {
                        name
                    }
                    user {
                        email
                        username
                    }
                    start_datetime
                    end_datetime
                }
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService.request(query).subscribe(
                (res: AxiosResponse) => {
                    this.prepareReportsProjectData(res.data.project_v2, startDate, endDate, durationTimeFormat);

                    return resolve(res);
                },
                (error: AxiosError) => reject(error)
            );
        });
    }

    getReportsProjects(
        teamId: string,
        projectNames: string[],
        userEmails: string[],
        startDate: string,
        endDate: string
    ) {
        const projectWhereStatement = projectNames.length
            ? `(
                where: {
                    team_id: {_eq: "${teamId}"},
                    name: {_in: [${projectNames.map(projectName => `"${projectName}"`).join(',')}]}
                },
                order_by: {name: asc}
            )`
            : `(
                where: {
                    team_id: {_eq: "${teamId}"}
                },
                order_by: {name: asc}
            )`;

        const userWhereStatement = userEmails.length
            ? `user: {email: {_in: [${userEmails.map(userEmail => `"${userEmail}"`).join(',')}]}}`
            : '';
        let dateStatement = '';

        if (startDate) {
            endDate = endDate ? endDate : startDate;

            dateStatement = `_or: [
                {start_datetime: {_gte: "${startDate}", _lte: "${endDate}"}},
                {end_datetime: {_gte: "${startDate}", _lte: "${endDate}"}},
                {start_datetime: {_lt: "${startDate}"}, end_datetime: {_gt: "${endDate}"}}
            ]`;
        }

        let timerStatementArray = [];
        if (userWhereStatement) {
            timerStatementArray.push(userWhereStatement);
        }
        if (dateStatement) {
            timerStatementArray.push(dateStatement);
        }
        const timerStatementString = timerStatementArray.join(', ');
        const timerWhereStatement = timerStatementString ? `(where: {${timerStatementString}})` : '';

        const query = `{
            project_v2 ${projectWhereStatement} {
                id
                name
                timer ${timerWhereStatement} {
                    start_datetime
                    end_datetime
                }
            }
        }`;

        return new Promise((resolve, reject) => {
            this.httpRequestsService.request(query).subscribe(
                (res: AxiosResponse) => {
                    for (let i = 0; i < res.data.project_v2.length; i++) {
                        const project = res.data.project_v2[i];
                        this.timerService.limitTimeEntriesByStartEndDates(project.timer, startDate, endDate);
                    }

                    return resolve(res);
                },
                (error: AxiosError) => reject(error)
            );
        });
    }

    async addProject(project: Project, userId: string) {
        let { name } = project;
        name = name.trim();
        const { projectColorId, clientId } = project;

        const currentTeamData: any = await this.teamService.getCurrentTeam(userId);
        const currentTeamId = currentTeamData.data.user_team[0].team.id;
        const slug = `${currentTeamId}-${slugify(name, { lower: true })}`;

        const isAdmin =
            currentTeamData.data.user_team[0].role_collaboration_id ===
            this.roleCollaborationService.ROLES_IDS.ROLE_ADMIN;

        let clientQueryParam = '';
        if (isAdmin) {
            if (clientId) {
                clientQueryParam = `client_id: "${clientId}"`;
            } else if (clientId === null) {
                clientQueryParam = `client_id: null`;
            }
        }

        const query = `mutation {
            insert_project_v2(
                objects: [
                    {
                        name: "${name}",
                        slug: "${slug}",
                        project_color_id: "${projectColorId}",
                        team_id: "${currentTeamId}"
                        ${clientQueryParam}
                    }
                ]
            ){
                returning {
                    id
                }
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }

    async getProjectById(userId: string, projectId: string) {
        const currentTeamData: any = await this.teamService.getCurrentTeam(userId);
        const isAdmin =
            currentTeamData.data.user_team[0].role_collaboration_id ===
            this.roleCollaborationService.ROLES_IDS.ROLE_ADMIN;

        const clientQueryParam = isAdmin ? `client { id, name }` : '';

        const query = `{
            project_v2(where: {id: {_eq: "${projectId}"}, team: {team_users: {user_id: {_eq: "${userId}"}}}}) {
                id
                name
                project_color {
                    id
                    name
                }
                ${clientQueryParam}
            }
        }`;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }

    async updateProjectById(id: string, project: Project, userId: string) {
        let { name } = project;
        name = name.trim();
        const { projectColorId, clientId } = project;

        const currentTeamData: any = await this.teamService.getCurrentTeam(userId);
        const currentTeamId = currentTeamData.data.user_team[0].team.id;
        const slug = `${currentTeamId}-${slugify(name, { lower: true })}`;

        const isAdmin =
            currentTeamData.data.user_team[0].role_collaboration_id ===
            this.roleCollaborationService.ROLES_IDS.ROLE_ADMIN;

        let clientQueryParam = '';
        if (isAdmin) {
            if (clientId) {
                clientQueryParam = `client_id: "${clientId}"`;
            } else if (clientId === null) {
                clientQueryParam = `client_id: null`;
            }
        }

        const query = `mutation {
            update_project_v2(
                where: {id: {_eq: "${id}"}, team: {team_users: {user_id: {_eq: "${userId}"}, role_collaboration_id: {_eq: "${
            this.roleCollaborationService.ROLES_IDS.ROLE_ADMIN
        }"}}}},
                _set: {
                    name: "${name}",
                    slug: "${slug}",
                    project_color_id: "${projectColorId}"
                    ${clientQueryParam}
                }
            ) {
                returning {
                    id
                }
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService.request(query).subscribe(
                (res: AxiosResponse) => {
                    if (!res.data.update_project_v2.returning[0]) {
                        return reject({
                            message: 'ERROR.PROJECT.UPDATE_FAILED',
                        });
                    }

                    return resolve(res);
                },
                (error: AxiosError) => reject(error)
            );
        });
    }

    deleteProjectById(id: string) {
        const query = `mutation {
            delete_project_v2(where: {id: {_eq: "${id}"}}) {
                affected_rows
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }

    private prepareReportsProjectData(data: any, startDate: string, endDate: string, durationTimeFormat: string): void {
        for (let i = 0; i < data.length; i++) {
            const projectV2 = data[i];
            this.timerService.limitTimeEntriesByStartEndDates(projectV2.timer, startDate, endDate);

            const projectV2Report = {};
            for (let j = 0; j < projectV2.timer.length; j++) {
                const timeEntry = projectV2.timer[j];
                const { issue, start_datetime: startDatetime, end_datetime: endDatetime, project, user } = timeEntry;
                const { name: projectName } = project;
                const { email: userEmail, username } = user;

                const uniqueTimeEntryKey = `${issue}-${projectName}-${userEmail}`;
                const previousDuration = projectV2Report[uniqueTimeEntryKey]
                    ? projectV2Report[uniqueTimeEntryKey].durationTimestamp
                    : 0;
                const currentDuration =
                    this.timeService.getTimestampByGivenValue(endDatetime) -
                    this.timeService.getTimestampByGivenValue(startDatetime);
                projectV2Report[uniqueTimeEntryKey] = {
                    user: {
                        username,
                    },
                    issue,
                    durationTimestamp: previousDuration + currentDuration,
                    startDatetime,
                    endDatetime: projectV2Report[uniqueTimeEntryKey]
                        ? projectV2Report[uniqueTimeEntryKey].endDatetime
                        : endDatetime,
                };
            }

            const projectV2ReportValues = Object.values(projectV2Report);
            projectV2ReportValues.sort(
                (a, b) =>
                    this.timeService.getTimestampByGivenValue(a['startDatetime']) -
                    this.timeService.getTimestampByGivenValue(b['startDatetime'])
            );
            for (let i = 0, projectV2ReportLength = projectV2ReportValues.length; i < projectV2ReportLength; i++) {
                let timeEntry = projectV2ReportValues[i];
                timeEntry['duration'] = this.timeService.getTimeDurationByGivenTimestamp(
                    timeEntry['durationTimestamp'],
                    durationTimeFormat
                );
            }

            data[i].timer = projectV2ReportValues.reverse();
        }
    }
}
