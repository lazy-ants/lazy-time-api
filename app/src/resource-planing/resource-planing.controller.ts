import {
    Controller,
    Response,
    HttpStatus,
    Post,
    Body,
    Patch,
    Param,
    UseGuards,
    Headers,
    UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AuthService } from '../auth/auth.service';
import { ResourcePlaningService } from './resource-planing.service';

@Controller('resource-planing')
export class ResourcePlaningController {
    constructor(
        private readonly authService: AuthService,
        private readonly resourcePlaningService: ResourcePlaningService
    ) {}

    @Post('add')
    @UseGuards(AuthGuard())
    async currentUserResources(@Headers() headers: any, @Response() res: any, @Body() body: any) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId) {
            throw new UnauthorizedException();
        }

        let resource = null;
        try {
            resource = await this.resourcePlaningService.createPlanResource({
                userId: body.userId,
                projectId: body.projectId,
                teamId: body.teamId,
                createdById: userId,
                totalDuration: body.totalDuration,
                startDate: body.startDate,
                endDate: body.endDate,
            });
        } catch (error) {
            console.log(error);
        }

        if (resource) {
            return res.status(HttpStatus.OK).json(resource);
        }

        return res
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .json({ message: 'ERROR.PLAN_RESOURCE.CREATE_PLAN_RESOURCE_FAILED' });
    }

    @Patch(':id')
    @UseGuards(AuthGuard())
    async updatePlanResource(@Headers() headers: any, @Param() param: any, @Response() res: any, @Body() body: any) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId) {
            throw new UnauthorizedException();
        }

        let resourceData = null;
        try {
            resourceData = await this.resourcePlaningService.getResourceById(param.id);
        } catch (err) {
            return res
                .status(HttpStatus.FORBIDDEN)
                .json({ message: 'ERROR.PLAN_RESOURCE.UPDATE_PLAN_RESOURCE_FAILED' });
        }

        if (!resourceData) {
            return res
                .status(HttpStatus.FORBIDDEN)
                .json({ message: 'ERROR.PLAN_RESOURCE.UPDATE_PLAN_RESOURCE_FAILED' });
        }

        const newResourceData: any = {
            userId: body.userId,
            projectId: body.projectId,
            teamId: body.teamId,
            totalDuration: body.totalDuration,
            startDate: body.startDate,
            endDate: body.endDate,
            userTimeOffId: body.userTimeOffId,
        };

        resourceData = {
            userId: resourceData.user_id,
            projectId: resourceData.project_id,
            teamId: resourceData.team_id,
            totalDuration: resourceData.total_duration,
            startDate: resourceData.start_date,
            endDate: resourceData.end_date,
            userTimeOffId: resourceData.user_time_off_id,
        };

        Object.keys(resourceData).forEach(prop => {
            const newValue = newResourceData[prop];
            resourceData[prop] = typeof newValue === 'undefined' || newValue === null ? resourceData[prop] : newValue;
        });

        try {
            const resourceUpdated = await this.resourcePlaningService.updateResource(param.id, resourceData);
            
            return res.status(HttpStatus.OK).json(resourceUpdated);
        } catch (err) {
            return res
                .status(HttpStatus.FORBIDDEN)
                .json({ message: 'ERROR.PLAN_RESOURCE.UPDATE_PLAN_RESOURCE_FAILED' });
        }
    }
}
