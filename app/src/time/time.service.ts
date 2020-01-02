import { Injectable } from '@nestjs/common';

@Injectable()
export class TimeService {
    constructor() {}

    getISOTime(): string {
        return new Date().toISOString();
    }

    getISOTimeWithZeroMilliseconds(): string {
        return new Date().toISOString().replace(/[0-9]{3}Z$/, '000Z');
    }

    getISOTimeByGivenValue(value: string | number): string {
        return new Date(value).toISOString();
    }

    getDateValueFromISOTimeByGivenValue(value: string | number): string {
        return this.getISOTimeByGivenValue(value).split('T')[0];
    }

    getTimeValueFromISOTimeByGivenValue(value: string | number): string {
        return this.getISOTimeByGivenValue(value).split('T')[1];
    }

    getUTCTime(): string {
        return new Date().toUTCString();
    }

    getUTCTimeByGivenValue(value: string | number): string {
        return new Date(value).toUTCString();
    }

    getISOTimeInPast(timeInPast: number): string {
        return this.getISOTimeByGivenValue(this.getTimestamp() - timeInPast);
    }

    getUTCTimeInPast(timeInPast: number): string {
        return this.getUTCTimeByGivenValue(this.getTimestamp() - timeInPast);
    }

    getTimestamp(): number {
        return new Date().getTime();
    }

    getTimestampByGivenValue(value: string | number): number {
        return new Date(value).getTime();
    }

    getStartDateOfPrevMonth() {
        const date = new Date();
        date.setDate(0);
        date.setDate(1);

        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    }

    getReadableTime(value: string | number, timeInPast: number): string {
        return this.getISOTimeByGivenValue(this.getTimestampByGivenValue(value) - timeInPast)
            .replace('T', ' ')
            .split('.')[0]; // 2019-01-01 00:00:00
    }

    getTimeDurationByGivenTimestamp(number: number, durationTimeFormat: string = 'improved'): string {
        const padTime = (item: number) => {
            if (!item) {
                return '00';
            }
            if ((item + '').length === 1) {
                return '0' + item;
            }
            return item;
        };

        const decimal = (time: number) => {
            let h = time / 1000 / 60 / 60;
            return `${h.toFixed(2)} h`;
        };

        const classic = (time: number) => {
            let hour: number, minute: number, seconds: number;
            seconds = Math.floor(time / 1000);
            minute = Math.floor(seconds / 60);
            seconds = seconds % 60;
            hour = Math.floor(minute / 60);
            minute = minute % 60;

            if (hour === 0 && minute === 0) {
                return `${padTime(seconds)} s`;
            } else if (hour === 0 && minute !== 0) {
                return `${padTime(minute)}:${padTime(seconds)} min`;
            } else if (hour !== 0) {
                return `${padTime(hour)}:${padTime(minute)}:${padTime(seconds)}`;
            }
        };

        const improved = (time: number) => {
            let hour: number, minute: number, seconds: number;
            seconds = Math.floor(time / 1000);
            minute = Math.floor(seconds / 60);
            seconds = seconds % 60;
            hour = Math.floor(minute / 60);
            minute = minute % 60;

            return `${padTime(hour)}:${padTime(minute)}:${padTime(seconds)}`;
        };

        if (durationTimeFormat === 'improved') {
            return improved(number);
        } else if (durationTimeFormat === 'decimal') {
            return decimal(number);
        } else if (durationTimeFormat === 'classic') {
            return classic(number);
        }
    }

    getDayPeriodsBetweenStartEndDates(startDate: string, endDate: string): any[] {
        let datesList = [];
        let currentDateTimestamp = this.getTimestampByGivenValue(startDate);
        const endDateTimestamp = this.getTimestampByGivenValue(endDate);
        while (currentDateTimestamp < endDateTimestamp) {
            const nextDateTimestamp = this.getTimestampByGivenValue(
                `${this.getDateValueFromISOTimeByGivenValue(
                    currentDateTimestamp + 24 * 60 * 60 * 1000
                )}T${this.getTimeValueFromISOTimeByGivenValue(startDate)}`
            );
            datesList.push({
                startPeriod: this.getISOTimeByGivenValue(currentDateTimestamp),
                endPeriod: this.getISOTimeByGivenValue(
                    nextDateTimestamp > endDateTimestamp ? endDateTimestamp : nextDateTimestamp
                ),
            });
            currentDateTimestamp = nextDateTimestamp;
        }

        return datesList;
    }
}
