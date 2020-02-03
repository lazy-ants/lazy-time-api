import { Injectable } from '@nestjs/common';

import { AxiosResponse, AxiosError } from 'axios';

import { HttpRequestsService } from '../core/http-requests/http-requests.service';
import { TeamService } from '../team/team.service';
import { RoleCollaborationService } from '../role-collaboration/role-collaboration.service';

@Injectable()
export class TimeOffDayService {
    constructor(
        private readonly teamService: TeamService,
        private readonly roleCollaborationService: RoleCollaborationService,
        private readonly httpRequestsService: HttpRequestsService
    ) {}

    async createTimeOffDay(data: {
        createdById: string;
        timeOffType: string;
    }): Promise<AxiosResponse | AxiosError> {
        const { createdById, timeOffType } = data;

        const currentTeamData: any = await this.teamService.getCurrentTeam(createdById);
        const isAdmin =
            currentTeamData.data.user_team[0].role_collaboration_id ===
            this.roleCollaborationService.ROLES_IDS.ROLE_ADMIN;

        if (isAdmin) {
            const query = `mutation {
                insert_time_off_day(
                    objects: [
                        {
                            time_off_type: "${timeOffType}",
                            team_id: "${currentTeamData.data.user_team[0].team.id}",
                            is_active: false,
                        }
                    ]
                ){
                    returning {
                        id
                        time_off_type
                        created_at
                        modified_at
                        team_id
                        is_active
                    }
                }
            }`;

            return new Promise((resolve, reject) => {
                this.httpRequestsService.request(query).subscribe(
                    (res: AxiosResponse) => resolve(res),
                    (err: AxiosError) => reject(err)
                );
            });
        } else {
            return Promise.reject({ message: 'ERROR.USER.NOT.ADMIN' });
        }
    }
}
