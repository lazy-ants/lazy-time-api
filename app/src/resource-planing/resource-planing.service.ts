import { Injectable } from '@nestjs/common';
import { HttpRequestsService } from '../core/http-requests/http-requests.service';
import { AxiosResponse, AxiosError } from 'axios';
import { RoleCollaborationService } from '../role-collaboration/role-collaboration.service';
import { TeamService } from '../team/team.service';
import { PlanResource } from './interfaces/resource-planing.interface';

@Injectable()
export class ResourcePlaningService {
    constructor(
        private readonly teamService: TeamService,
        private readonly roleCollaborationService: RoleCollaborationService,
        private readonly httpRequestsService: HttpRequestsService
    ) {}

    async createPlanResource(data: {
        userId: string;
        projectId: string;
        teamId: string;
        createdById: string;
        totalDuration: string;
        startDate: string;
        endDate: string;
    }): Promise<AxiosResponse | AxiosError> {
        const { userId, projectId, teamId, createdById, totalDuration, startDate, endDate } = data;

        const currentTeamData: any = await this.teamService.getCurrentTeam(createdById);
        const isAdmin =
            currentTeamData.data.user_team[0].role_collaboration_id ===
            this.roleCollaborationService.ROLES_IDS.ROLE_ADMIN;

        if (isAdmin) {
            const query = `mutation {
                insert_plan_resource(
                    objects: [
                        {
                            user_id: "${userId}",
                            project_id: "${projectId}",
                            created_by_id: "${createdById}",
                            team_id: "${teamId}",
                            total_duration: "${totalDuration}",
                            start_date: "${startDate}",
                            end_date: "${endDate}"
                        }
                    ]
                ){
                    returning {
                        id
                    }
                }
            }`;

            return new Promise((resolve, reject) => {
                this.httpRequestsService.request(query).subscribe(
                    async (insertResourceRes: AxiosResponse) => {
                        const returningRows = insertResourceRes.data.plan_resource.returning;
                        if (returningRows.length) {
                            return resolve(insertResourceRes);
                        }
                    },
                    (insertResourceError: AxiosError) => reject(insertResourceError)
                );
            });
        } else {
            return Promise.reject({ message: 'ERROR.USER.NOT.ADMIN' });
        }
    }

    async getResourceById(id: string): Promise<PlanResource | AxiosError> {
        const whereStatements = [`id: { _eq: "${id}" }`];

        return new Promise((resolve, reject) => {
            this.getResourceData(whereStatements.join(',')).then(
                (res: PlanResource) => resolve(res),
                (error: AxiosError) => reject(error)
            );
        });
    }

    async getResourceData(whereStatement: string): Promise<any | null | AxiosError> {
        const query = `{
            plan_resource(where: {${whereStatement}}) {
                id
                created_at
                created_by_id
                end_date
                modified_at
                project_id
                start_date
                team_id
                total_duration
                user_id
                user_time_off_id
            }
        }
        `;

        let resource: any = null;

        return new Promise((resolve, reject) => {
            this.httpRequestsService.request(query).subscribe(
                (res: AxiosResponse) => {
                    const resource = res.data.plan_resource.shift();
                    return resolve(resource);
                },
                (error: AxiosError) => reject(error)
            );
        });
    }

    async updateResource(
        resourceId: string,
        data: {
            projectId: string;
            teamId: string;
            userId: string;
            totalDuration: number;
            startDate: string;
            endDate: string;
            modifiedAt: string;
            userTimeOffId: string;
        }
    ): Promise<AxiosResponse | AxiosError> {
        const { projectId, teamId, totalDuration, startDate, endDate, modifiedAt, userId, userTimeOffId } = data;

        let query = null;

        if (userTimeOffId !== 'null') {
            query = `mutation {
                update_plan_resource(
                    where: {
                        id: {_eq: "${resourceId}"}
                    },
                    _set: {
                        end_date: "${endDate}",
                        modified_at: "${modifiedAt}",
                        project_id: "${projectId}",
                        start_date: "${startDate}",
                        team_id: "${teamId}",
                        total_duration: "${totalDuration}",
                        user_id: "${userId}"
                        user_time_off_id: "${userTimeOffId}"
                    }
                ) {
                    returning {
                        id
                    }
                }
            }`;
        } else {
            query = `mutation {
                update_plan_resource(
                    where: {
                        id: {_eq: "${resourceId}"}
                    },
                    _set: {
                        end_date: "${endDate}",
                        modified_at: "${modifiedAt}",
                        project_id: "${projectId}",
                        start_date: "${startDate}",
                        team_id: "${teamId}",
                        total_duration: "${totalDuration}",
                        user_id: "${userId}"
                    }
                ) {
                    returning {
                        id
                    }
                }
            }`;
        }

        return new Promise(async (resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }
    async deleteResourceById(resourceId: string, userId: string): Promise<AxiosResponse | AxiosError> {
        const currentTeamData: any = await this.teamService.getCurrentTeam(userId);
        const isAdmin =
            currentTeamData.data.user_team[0].role_collaboration_id ===
            this.roleCollaborationService.ROLES_IDS.ROLE_ADMIN;
        if (isAdmin) {
            const query = `mutation {
            delete_plan_resource(where: {id: {_eq: "${resourceId}"}}) {
                affected_rows
            }
        }`;

            return new Promise(async (resolve, reject) => {
                this.httpRequestsService
                    .request(query)
                    .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
            });
        } else {
            return Promise.reject({ message: 'ERROR.USER.NOT.ADMIN' });
        }
    }
}
