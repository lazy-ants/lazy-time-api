import { AxiosError, AxiosResponse } from 'axios';
import { Injectable } from '@nestjs/common';
import { HttpRequestsService } from '../core/http-requests/http-requests.service';
import { UserService } from '../user/user.service';
import BillwerkAPI from 'billwerk/dist';
import { Payment } from './interfaces/payment.interface';

@Injectable()
export class PaymentService {
    apiService: any = new BillwerkAPI(
        process.env.BILLWERK_CLIENT_ID,
        process.env.BILLWERK_CLIENT_SECRET,
        process.env.BILLWERK_HOST,
        '/api/v1',
        true
    );

    constructor(private readonly httpRequestsService: HttpRequestsService, private readonly userService: UserService) {}

    getCustomer(customerId: string) {
        return this.apiService.getCustomer(customerId);
    }

    getContractSelfServiceToken(contractId) {
        return this.apiService.getContractSelfServiceToken(contractId);
    }

    getContract(contractId: string) {
        return this.apiService.getContract(contractId);
    }

    getPlan(planId: string) {
        return this.apiService.getPlan(planId);
    }

    getPlanVariant(planVariantId: string) {
        return this.apiService.getPlanVariant(planVariantId);
    }

    async getSubscriptionDetailsByContractId(contractId: string) {
        const contract = await this.getContract(contractId);

        const { LastBillingDate, NextBillingDate, PlanVariantId, LifecycleStatus } = contract;
        const { EmailAddress } = await this.getCustomer(contract.CustomerId);

        return { LastBillingDate, NextBillingDate, EmailAddress, PlanVariantId, LifecycleStatus };
    }

    async getCustomerTokenByUserId(userId) {
        const paymentResponse = await this.getPaymentByUserId(userId);

        const payments: Payment[] = paymentResponse.data.payment_history;

        const result = payments.filter((payment: Payment) => payment.status === 'Active');

        const token = await this.getContractSelfServiceToken(result[0].contract_id);

        return token.Token;
    }

    async sendPayment(data: {
        payment: {
            subscription_id: string;
            from: string;
            to: string;
            status?: string;
            contract_id: string;
        };
        userId: string;
    }): Promise<AxiosResponse | AxiosError> {
        const variables = {
            objects: [
                {
                    user_id: data.userId,
                    status: data.payment.status,
                    subscription_id: data.payment.subscription_id,
                    from: data.payment.from,
                    to: data.payment.to,
                    contract_id: data.payment.contract_id,
                },
            ],
        };

        const insertPayment = `mutation insert_payment_history($objects: [payment_history_insert_input!]!){
            insert_payment_history: insert_payment_history(objects: $objects) {
                returning {
                    id
                }
            }
        }`;
        return new Promise((resolve, reject) => {
            this.httpRequestsService.graphql(insertPayment, variables).subscribe(
                async (insertPaymentRes: AxiosResponse) => {
                    return resolve(insertPaymentRes);
                },
                (insertUserError: AxiosError) => reject(insertUserError)
            );
        });
    }

    async createPayment(contractId: string) {
        try {
            const {
                LastBillingDate,
                NextBillingDate,
                PlanVariantId,
                EmailAddress,
                LifecycleStatus,
            } = await this.getSubscriptionDetailsByContractId(contractId);

            let user = null;

            try {
                user = await this.userService.getUserByEmail(EmailAddress);
            } catch (error) {
                console.log(error);
            }

            if (user.id) {
                await this.sendPayment({
                    payment: {
                        from: LastBillingDate,
                        to: NextBillingDate,
                        subscription_id: PlanVariantId,
                        status: LifecycleStatus === 'Active' ? 'Active' : 'Inactive',
                        contract_id: contractId,
                    },
                    userId: user.id,
                });
            }
            // TODO: Send email
        } catch (e) {
            console.log(`Error in payment controller:`, e);
        }
    }

    async contractChanged(contractId: string) {
        let {
            LastBillingDate,
            NextBillingDate,
            PlanVariantId,
            LifecycleStatus,
        } = await this.getSubscriptionDetailsByContractId(contractId);

        LifecycleStatus = LifecycleStatus === 'Active' ? 'Active' : 'Inactive';

        const variables = {
            where: {
                contract_id: {
                    _eq: contractId,
                },
            },
            set: {
                status: LifecycleStatus,
                subscription_id: PlanVariantId,
                from: LastBillingDate,
                to: NextBillingDate,
            },
        };

        const query = `mutation update_payment_history($where: payment_history_bool_exp!, $set: payment_history_set_input) {
            update_payment_history: update_payment_history(where: $where, _set: $set) {
              returning {
                id
              }
            }
        }`;

        return new Promise((resolve, reject) => {
            this.httpRequestsService.graphql(query, variables).subscribe(
                async (res: AxiosResponse) => {
                    return resolve(res);
                },
                (err: AxiosError) => reject(err)
            );
        });
    }

    async getPaymentByUserId(userId: string): Promise<AxiosResponse> {
        const variables = {
            where: {
                user_id: {
                    _eq: userId,
                },
            },
        };

        const queryPayments = `query payment_history($where: payment_history_bool_exp) {
                payment_history: payment_history(order_by: {to: desc}, where: $where) {
                    id
                    status
                    from
                    to
                    contract_id
                    user_id
                    subscription {
                        id
                        plan_id
                        plan_name
                        term
                    }
                }
            }`;

        return new Promise((resolve, reject) => {
            this.httpRequestsService.graphql(queryPayments, variables).subscribe(
                async (insertPaymentRes: AxiosResponse) => {
                    return resolve(insertPaymentRes);
                },
                (insertUserError: AxiosError) => reject(insertUserError)
            );
        });
    }
}
