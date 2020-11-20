import {
    Controller,
    Get,
    Patch,
    Delete,
    Param,
    Response,
    HttpStatus,
    Body,
    Query,
    Headers,
    UseGuards,
    UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AxiosError, AxiosResponse } from 'axios';

import { TimerService } from './timer.service';
import { TeamService } from '../team/team.service';
import { AuthService } from '../auth/auth.service';
import { Timer } from './interfaces/timer.interface';

@Controller('timer')
export class TimerController {
    constructor(
        private readonly timerService: TimerService,
        private readonly teamService: TeamService,
        private readonly authService: AuthService
    ) {}

    @Get('user-list')
    @UseGuards(AuthGuard())
    async userTimerList(
        @Headers() headers: any,
        @Response() res: any,
        @Query()
        params: { page?: string; limit?: string; startDateTime?: string; endDateTime?: string; searchValue?: string }
    ) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId) {
            throw new UnauthorizedException();
        }
        if (Object.keys(params).length) {
            const { page, limit } = params;
            if (!Number.parseInt(page) || !Number.parseInt(limit) || +page <= 0 || +limit <= 0) {
                return res.status(HttpStatus.BAD_REQUEST).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
            }
        }

        try {
            const userTimerListRes = await this.timerService.getUserTimerList(userId, params);
            return res.status(HttpStatus.OK).json(userTimerListRes);
        } catch (err) {
            const error: AxiosError = err;
            return res.status(HttpStatus.BAD_REQUEST).json(error.response ? error.response.data.errors : error);
        }
    }

    @Get('reports-list')
    @UseGuards(AuthGuard())
    async reportsTimerList(@Headers() headers: any, @Response() res: any, @Query() params) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId) {
            throw new UnauthorizedException();
        }

        if (!(params.startDate && params.endDate)) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
        }

        if (params.userEmails && Object.prototype.toString.call(params.userEmails) !== '[object Array]') {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
        }

        if (params.projectNames && Object.prototype.toString.call(params.projectNames) !== '[object Array]') {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
        }

        let teamId;
        try {
            const currentTeamRes = await this.teamService.getCurrentTeam(userId);
            teamId = (currentTeamRes as AxiosResponse).data.user_team[0].team.id;
        } catch (err) {
            const error: AxiosError = err;
            return res.status(HttpStatus.BAD_REQUEST).json(error.response ? error.response.data.errors : error);
        }

        if (!teamId) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.NOT_MEMBER' });
        }

        try {
            const userTimerListRes = await this.timerService.getReportsTimerList(
                teamId,
                params.userEmails || [],
                params.projectNames || [],
                params.startDate,
                params.endDate
            );
            return res.status(HttpStatus.OK).json(userTimerListRes);
        } catch (err) {
            const error: AxiosError = err;
            return res.status(HttpStatus.BAD_REQUEST).json(error.response ? error.response.data.errors : error);
        }
    }

    @Patch(':id')
    @UseGuards(AuthGuard())
    async updateTimerById(@Headers() headers: any, @Param() param: any, @Response() res: any, @Body() body: Timer) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId) {
            throw new UnauthorizedException();
        }

        if (!body.projectId) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
        }

        try {
            const updateTimerByIdRes = await this.timerService.updateTimerById(userId, param.id, body);
            return res.status(HttpStatus.OK).json(updateTimerByIdRes);
        } catch (err) {
            const error: AxiosError = err;
            return res.status(HttpStatus.BAD_REQUEST).json(error.response ? error.response.data.errors : error);
        }
    }

    @Delete(':id')
    @UseGuards(AuthGuard())
    async deleteTimerById(@Headers() headers: any, @Param() param: any, @Response() res: any) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId) {
            throw new UnauthorizedException();
        }

        try {
            const deleteTimerByIdRes = await this.timerService.deleteTimerById(userId, param.id);
            return res.status(HttpStatus.OK).json(deleteTimerByIdRes);
        } catch (err) {
            const error: AxiosError = err;
            return res.status(HttpStatus.BAD_REQUEST).json(error.response ? error.response.data.errors : error);
        }
    }
}
