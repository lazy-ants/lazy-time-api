import { Module } from '@nestjs/common';

import { CoreModule } from '../core/core.module';
import { AuthModule } from '../auth/auth.module';
import { TimerModule } from '../timer/timer.module';
import { TimeModule } from '../time/time.module';
import { FileModule } from '../file/file.module';
import { TeamModule } from '../team/team.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
    imports: [CoreModule, AuthModule, TimerModule, TimeModule, FileModule, TeamModule],
    controllers: [ReportController],
    providers: [ReportService],
})
export class ReportModule {}
