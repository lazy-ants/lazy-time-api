import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    HttpStatus,
    Headers,
    Param,
    Response,
    Body,
    UseGuards,
    UnauthorizedException,
    UseInterceptors,
    UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { AxiosError, AxiosResponse } from 'axios';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';

import { AuthService } from '../auth/auth.service';
import { UserService } from '../user/user.service';
import { TeamService } from '../team/team.service';
import { SocialService } from '../social/social.service';
import { RoleCollaborationService } from '../role-collaboration/role-collaboration.service';
import { MailService } from '../core/mail/mail.service';
import { User } from './interfaces/user.interface';
import { ProjectService } from '../project/project.service';

@Controller('user')
export class UserController {
    constructor(
        private readonly authService: AuthService,
        private readonly userService: UserService,
        private readonly teamService: TeamService,
        private readonly socialService: SocialService,
        private readonly roleCollaborationService: RoleCollaborationService,
        private readonly mailService: MailService,
        private readonly projectService: ProjectService
    ) {}

    @Get('')
    @UseGuards(AuthGuard())
    async getUser(@Headers() headers: any, @Response() res: any) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId) {
            throw new UnauthorizedException();
        }

        let user = null;
        try {
            user = await this.userService.getUserById(userId);
        } catch (err) {
            console.log(err);
        }

        if (!user) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.GET_USER_FAILED' });
        }

        return res.status(HttpStatus.OK).json(this.userService.getPublicUserData(user));
    }

    @Get('list')
    @UseGuards(AuthGuard())
    async userList(@Headers() headers: any, @Response() res: any) {
        try {
            const userListRes = await this.userService.getUserList();
            return res.status(HttpStatus.OK).json(userListRes);
        } catch (err) {
            const error: AxiosError = err;
            return res.status(HttpStatus.BAD_REQUEST).json(error.response ? error.response.data.errors : error);
        }
    }

    @Get('teams')
    @UseGuards(AuthGuard())
    async userTeams(@Headers() headers: any, @Response() res: any, @Param() param: any) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId) {
            throw new UnauthorizedException();
        }

        try {
            const teamsData = await this.teamService.getAllUserTeams(userId);
            return res.status(HttpStatus.OK).json(teamsData);
        } catch (err) {
            const error: AxiosError = err;
            return res.status(HttpStatus.BAD_REQUEST).json(error.response ? error.response.data.errors : error);
        }
    }

    @Post('reset-password')
    async resetPassword(@Response() res: any, @Body() body: { email: string }) {
        if (!this.mailService.emailStandardize(body.email)) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
        }

        let user = null;
        try {
            user = await this.userService.getUserByEmail(this.mailService.emailStandardize(body.email));
        } catch (error) {
            console.log(error);
        }

        if (user) {
            let resetPasswordData = null;
            try {
                resetPasswordData = await this.userService.resetPassword(this.mailService.emailStandardize(body.email));
            } catch (error) {
                console.log(error);
            }

            if (resetPasswordData) {
                const to = this.mailService.emailStandardize(body.email);
                const subject = `You've been requested the reset password!`;
                const html = `
                Follow the link below to reset the password:
                <br /><br />
                ${process.env.APP_URL}/reset-password?token=${
                    resetPasswordData.data.update_user.returning[0].reset_password_hash
                }
                <br /><br />
                <a href="${process.env.APP_URL}">Wobbly</a>
                <br />
                © 2020 All rights reserved.
            `;
                this.mailService.send(to, subject, html);
                return res.status(HttpStatus.OK).json({ message: 'SUCCESS.USER.RESET_EMAIL_CHECK' });
            }
        }

        return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.RESET_EMAIL_FAILED' });
    }

    @Post('set-password')
    async setPassword(@Response() res: any, @Body() body: { token: string; password: string }) {
        if (!(body.token && body.password)) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
        }

        let user = null;
        try {
            user = await this.userService.getUserByResetPasswordHash(body.token);
        } catch (error) {
            console.log(error);
        }

        if (user) {
            let setPasswordData = null;
            try {
                setPasswordData = await this.userService.setPassword(body.token, body.password);
            } catch (error) {
                console.log(error);
            }

            if (setPasswordData) {
                const to = this.mailService.emailStandardize(setPasswordData.data.update_user.returning[0].email);
                const subject = `You've been successfully reset the password!`;
                const html = `
                Please use the email below to access the Wobbly ${process.env.APP_URL}
                <br /><br />

                <b>Email:</b> ${to}

                <br /><br />
                <a href="${process.env.APP_URL}">Wobbly</a>
                <br />
                © 2020 All rights reserved.
            `;
                this.mailService.send(to, subject, html);
                return res.status(HttpStatus.OK).json({ message: 'SUCCESS.USER.RESET_PASSWORD' });
            }
        }

        return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.INTERNAL' });
    }

    @Post('change-password')
    @UseGuards(AuthGuard())
    async changePassword(
        @Headers() headers: any,
        @Response() res: any,
        @Body() body: { password: string; newPassword: string }
    ) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId) {
            throw new UnauthorizedException();
        }

        if (!(body.password && body.newPassword)) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
        }

        let user = null;
        try {
            user = await this.userService.getUserById(userId);
        } catch (error) {
            console.log(error);
        }

        if (user) {
            if (await this.userService.compareHash(body.password, user.password)) {
                let changePasswordData = null;
                try {
                    changePasswordData = await this.userService.changePassword(userId, body.newPassword);
                } catch (error) {
                    console.log(error);
                }

                if (changePasswordData) {
                    const to = this.mailService.emailStandardize(
                        changePasswordData.data.update_user.returning[0].email
                    );
                    const subject = `You've been successfully changed the password!`;
                    const html = `
                    Please use the email below to access the Wobbly ${process.env.APP_URL}
                    <br /><br />

                    <b>Email:</b> ${to}

                    <br /><br />
                    <a href="${process.env.APP_URL}">Wobbly</a>
                    <br />
                    © 2020 All rights reserved.
                `;
                    this.mailService.send(to, subject, html);
                    return res.status(HttpStatus.OK).json({ message: 'SUCCESS.USER.PASSWORD_CHANGED' });
                }
            } else {
                return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.CURRENT_PASSWORD_WRONG' });
            }
        }

        return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.CHANGE_PASSWORD_FAILED' });
    }

    @Post('login')
    async loginUser(@Response() res: any, @Body() body: User) {
        if (!(this.mailService.emailStandardize(body.email) && body.password)) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
        }

        let user = null;
        try {
            user = await this.userService.getUserByEmail(this.mailService.emailStandardize(body.email));
        } catch (error) {
            console.log(error);
        }

        if (user) {
            if (!user.social) {
                const socialId: any = await this.socialService.createSocialTable();
                await this.socialService.addSocialTable(user.id, socialId);
            }

            if (await this.userService.compareHash(body.password, user.password)) {
                try {
                    const nowDate: string = new Date().toISOString();
                    await Promise.all([
                        this.userService.updateUserLastLogin(user.id, nowDate),
                        this.userService.updateUserTimezoneOffset(user.id, body.timezoneOffset),
                    ]);
                } catch (error) {
                    console.log(error);
                }
                const token = await this.userService.signIn(user);
                return res.status(HttpStatus.OK).json({ token });
            }
        }

        return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.EMAIL_PASSWORD_WRONG' });
    }

    @Post('login-fb')
    async loginFacebookUser(@Response() res: any, @Body() body: User) {
        if (!(body.id && body.username)) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
        }

        const facebookId = body.id;
        const userEmail = this.mailService.emailStandardize(body.email) || `fb${facebookId}@wobbly.me`;
        const userName = body.username || userEmail;

        let userFb = null;
        try {
            userFb = await this.userService.getUserBySocial('facebook_id', facebookId);
        } catch (error) {
            console.log(error);
        }

        if (userFb) {
            try {
                const nowDate: string = new Date().toISOString();
                await Promise.all([
                    this.userService.updateUserLastLogin(userFb.id, nowDate),
                    this.userService.updateUserTimezoneOffset(userFb.id, body.timezoneOffset),
                ]);
            } catch (error) {
                console.log(error);
            }
            const token = await this.userService.signIn(userFb);
            return res.status(HttpStatus.OK).json({ token });
        } else {
            let user = null;
            try {
                user = await this.userService.getUserByEmail(userEmail);
            } catch (error) {
                console.log(error);
            }

            if (user) {
                let socialId = user.socialId;

                if (user.social && user.social.facebookId) {
                    return res
                        .status(HttpStatus.FORBIDDEN)
                        .json({ message: 'ERROR.USER.THIS_EMAIL_ALREADY_CONNECTED_TO_ANOTHER_FB_ACCOUNT' });
                } else if (!socialId) {
                    socialId = await this.socialService.createSocialTable();
                    await this.socialService.addSocialTable(user.id, socialId);
                }
                try {
                    const nowDate: string = new Date().toISOString();
                    await Promise.all([
                        this.socialService.setSocial(socialId, 'facebook', facebookId),
                        this.userService.updateUserLastLogin(user.id, nowDate),
                        this.userService.updateUserTimezoneOffset(user.id, body.timezoneOffset),
                    ]);
                } catch (error) {
                    console.log(error);
                }
                const token = await this.userService.signIn(user);

                return res.status(HttpStatus.OK).json({ token });
            }

            let newUserFb = null;
            try {
                const userPassword = Math.random()
                    .toString(36)
                    .slice(-8);
                await this.userService.createUser({
                    username: userName,
                    email: userEmail,
                    password: userPassword,
                    language: body.language,
                    timezoneOffset: body.timezoneOffset,
                });
                newUserFb = await this.userService.getUserByEmail(userEmail);
            } catch (error) {
                console.log(error);
            }

            if (newUserFb) {
                await this.socialService.setSocial(newUserFb.socialId, 'facebook', facebookId);
                const token = await this.userService.signIn(newUserFb);

                return res.status(HttpStatus.OK).json({ token });
            }

            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'ERROR.USER.USER_FAILED' });
        }
    }

    @Post('invite')
    @UseGuards(AuthGuard())
    async inviteByEmail(
        @Headers() headers: any,
        @Response() res: any,
        @Body() body: { teamId: string; teamName: string; email: string }
    ) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId) {
            throw new UnauthorizedException();
        }

        if (!this.mailService.emailStandardize(body.email)) {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
        }

        let teamId;
        let teamName;
        try {
            const currentTeamRes = await this.teamService.getCurrentTeam(userId);
            const userTeamData = (currentTeamRes as AxiosResponse).data.user_team[0];
            if (!userTeamData) {
                return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.CREATE_INVITE_FAILED' });
            }
            teamId = userTeamData.team.id;
            teamName = userTeamData.team.name || '';
        } catch (err) {
            const error: AxiosError = err;
            return res.status(HttpStatus.BAD_REQUEST).json(error.response ? error.response.data.errors : error);
        }

        if (!teamId) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.NOT_MEMBER' });
        }

        const usersData: any = await this.userService.getUserList();
        const users = usersData.data.user;
        const userExists = users.filter(
            user => this.mailService.emailStandardize(user.email) === this.mailService.emailStandardize(body.email)
        );

        let invitedData: any = null;
        if (userExists.length > 0) {
            // Such user is already registered
            try {
                invitedData = await this.teamService.inviteMemberToTeam(userId, teamId, userExists[0].id);
            } catch (e) {
                const error: AxiosError = e;
                return res.status(HttpStatus.BAD_REQUEST).json(error.response ? error.response.data.errors : error);
            }

            const to = this.mailService.emailStandardize(body.email);
            const subject = `You've been invited to the "${teamName}" team!`;
            const html = `
            Follow the link below to accept the invitation to the "${teamName}" team:
            <br /><br />
            ${process.env.APP_URL}/team/${teamId}/invite/${invitedData.data.insert_user_team.returning[0].invite_hash}
            <br /><br />
            <a href="${process.env.APP_URL}">Wobbly</a>
            <br />
            © 2020 All rights reserved.
        `;
            this.mailService.send(to, subject, html);
        } else {
            // No such user registered, let us create one.

            // Generating random password
            const userPassword = Math.random()
                .toString(36)
                .slice(-8);
            const createdData: any = await this.userService.createUser({
                username: this.mailService.emailStandardize(body.email),
                email: this.mailService.emailStandardize(body.email),
                password: userPassword,
                timezoneOffset: 0,
            });

            // Get created user ID from createdData and process inviteRequest from Team Service
            invitedData = await this.teamService.inviteMemberToTeam(
                userId,
                teamId,
                createdData.data.insert_user.returning[0].id
            );

            const subject = `You've been invited to the "${teamName}" team!`;
            const html = `
            Follow the link below to accept the invitation to the "${teamName}" team:
            <br /><br />
            ${process.env.APP_URL}/team/${teamId}/invite/${invitedData.data.insert_user_team.returning[0].invite_hash}
            <br /><br />
            <br /><br />
            Please use the email below to access the Wobbly ${process.env.APP_URL}
            <br /><br />

            <b>Email:</b> ${this.mailService.emailStandardize(body.email)}

            <br /><br />
            <a href="${process.env.APP_URL}">Wobbly</a>
            <br />
            © 2020 All rights reserved.
        `;
            this.mailService.send(this.mailService.emailStandardize(body.email), subject, html);
        }

        return res.status(HttpStatus.CREATED).json({
            invitedUserId: invitedData.data.insert_user_team.returning,
        });
    }

    @Post('register')
    async registerUser(@Response() res: any, @Body() body: any) {
        if (!(this.mailService.emailStandardize(body.email) && body.password)) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
        }

        let userExists = false;
        try {
            userExists = await this.userService.checkUserExists({
                email: this.mailService.emailStandardize(body.email),
            });
        } catch (error) {
            console.log(error);
        }

        if (userExists === true) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.EMAIL_EXISTS' });
        }

        let user = null;
        try {
            user = await this.userService.createUser({
                username: body.username || this.mailService.emailStandardize(body.email),
                email: this.mailService.emailStandardize(body.email),
                password: body.password,
                language: body.language,
                timezoneOffset: body.timezoneOffset,
            });
        } catch (error) {
            console.log(error);
        }

        if (user) {
            const token = await this.userService.signIn((await this.userService.getUserByEmail(
                this.mailService.emailStandardize(body.email)
            )) as User);

            const to = this.mailService.emailStandardize(body.email);
            const subject = `Welcome on Wobbly board! Time in safe now!`;
            const html = `
                Howdy,
                <br /><br />
                I'll be short, Wobbly is free to use, rescue for your personal
                or team effectiveness.
                <br /><br />
                Just note that you can not only Track your time, but
                <ul>
                    <li>one click sync task, time with Jira</li>
                    <li>manage multiple teams, projects, clients</li>
                    <li>make your plan clear with Resource Planning</li>
                    <li>bill your client right from Wobbly Invoice</li>
                </ul>
                Stay tuned, that's just beginning ;)
                <br /><br />
                Ah, forget, Wobbly is opensource, feel free drop your idea on github.com/wbbly
                <br /><br />
                Alex Demchenko<br />
                Wobbly Team Captain<br />
                <a href="${process.env.APP_URL}">wobbly.me</a>
                <br />
                © 2020 All rights reserved.
            `;
            this.mailService.send(to, subject, html);

            return res.status(HttpStatus.OK).json({ token });
        }

        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'ERROR.USER.CREATE_USER_FAILED' });
    }

    @Patch(':id')
    @UseGuards(AuthGuard())
    async updateUser(@Headers() headers: any, @Param() param: any, @Response() res: any, @Body() body: any) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId || param.id !== userId) {
            throw new UnauthorizedException();
        }

        let user = null;
        try {
            user = await this.userService.getUserById(param.id);
        } catch (err) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }

        if (!user) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }

        const newUserData: any = {
            username: body.username,
            email: this.mailService.emailStandardize(body.email),
            language: body.language,
            tokenJira: body.tokenJira,
            urlJira: body.urlJira,
            typeJira: body.typeJira,
            loginJira: body.loginJira,
            phone: body.phone,
            onboardingMobile: body.onboardingMobile,
            technologies: body.technologies || [],
            country: body.country,
            city: body.city,
            state: body.state,
            zip: body.zip,
            companyName: body.companyName,
        };

        const userData = {
            username: user.username,
            email: this.mailService.emailStandardize(user.email),
            language: user.language,
            tokenJira: user.tokenJira,
            urlJira: user.urlJira,
            typeJira: user.typeJira,
            loginJira: user.loginJira,
            phone: user.phone,
            onboardingMobile: user.onboardingMobile,
            technologies:
                user.userTechnologies && user.userTechnologies.length
                    ? user.userTechnologies.map(el => el.technology.id)
                    : [],
            country: user.country,
            city: user.city,
            state: user.state,
            zip: user.zip,
            companyName: user.companyName,
        };
        Object.keys(userData).forEach(prop => {
            const newValue = newUserData[prop];
            userData[prop] = typeof newValue === 'undefined' || newValue === null ? userData[prop] : newValue;
        });

        try {
            let userExists = false;
            let userToFind = null;
            try {
                userExists = await this.userService.checkUserExists({
                    email: this.mailService.emailStandardize(body.email),
                });
                userToFind = await this.userService.getUserByEmail(body.email);
            } catch (error) {
                console.log(error);
            }

            if (userExists === true && userToFind && userToFind.id !== user.id) {
                return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.EMAIL_EXISTS' });
            }

            await this.userService.updateUser(userId, userData);

            let userUpdated = null;
            try {
                userUpdated = await this.userService.getUserById(userId);
            } catch (err) {
                console.log(err);
            }

            if (!userUpdated) {
                return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
            }

            return res.status(HttpStatus.OK).json(this.userService.getPublicUserData(userUpdated));
        } catch (err) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }
    }

    @Post(':id/avatar')
    @UseGuards(AuthGuard())
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './avatars',
                filename: (req, file, cb) => {
                    const randomName = Array(32)
                        .fill(null)
                        .map(() => Math.round(Math.random() * 16).toString(16))
                        .join('');

                    return cb(null, `${randomName}${extname(file.originalname)}`);
                },
            }),
        })
    )
    async addUserAvatar(
        @Headers() headers: any,
        @Param() param: any,
        @Response() res: any,
        @Body() body: any,
        @UploadedFile() file
    ) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId || param.id !== userId) {
            throw new UnauthorizedException();
        }

        if (!(file && file.path)) {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
        }

        let user = null;
        let avatarPath = null;
        try {
            user = await this.userService.getUserById(param.id);
            avatarPath = user.avatar;
        } catch (err) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }

        if (!user) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }

        try {
            await this.userService.updateUserAvatar(userId, file.path);

            let userUpdated = null;
            try {
                userUpdated = await this.userService.getUserById(userId);
            } catch (err) {
                console.log(err);
            }

            if (!userUpdated) {
                return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
            }

            if (avatarPath) {
                fs.unlinkSync(avatarPath);
            }

            return res.status(HttpStatus.OK).json(this.userService.getPublicUserData(userUpdated));
        } catch (err) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }
    }

    @Delete(':id/avatar')
    @UseGuards(AuthGuard())
    async removeUserAvatar(@Headers() headers: any, @Param() param: any, @Response() res: any, @Body() body: any) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId || param.id !== userId) {
            throw new UnauthorizedException();
        }

        let user = null;
        let avatarPath = null;
        try {
            user = await this.userService.getUserById(param.id);
            avatarPath = user.avatar;
        } catch (err) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }

        if (!user) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }

        try {
            await this.userService.updateUserAvatar(userId, null);

            let userUpdated = null;
            try {
                userUpdated = await this.userService.getUserById(userId);
            } catch (err) {
                console.log(err);
            }

            if (!userUpdated) {
                return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
            }

            if (avatarPath) {
                fs.unlinkSync(avatarPath);
            }

            return res.status(HttpStatus.OK).json(this.userService.getPublicUserData(userUpdated));
        } catch (err) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }
    }

    @Patch(':id/team')
    @UseGuards(AuthGuard())
    async updateUserInTeam(@Headers() headers: any, @Param() param: any, @Response() res: any, @Body() body: any) {
        // The user id to update
        const userId = param.id;

        // The admin id who want to update the user
        const adminId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!adminId) {
            throw new UnauthorizedException();
        }

        // An array of current teams information
        let currentUserTeamData = null;
        try {
            const currentTeamRes = await this.teamService.getCurrentTeam(adminId);
            currentUserTeamData = (currentTeamRes.data.user_team || [])[0] || null;
        } catch (err) {
            console.log(err);
        }

        if (currentUserTeamData === null) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }

        // The id of the current admin's team
        const adminTeamId = (currentUserTeamData.team || {}).id;

        if (!adminTeamId) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }
        const { ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER, ROLE_INVOICES_MANAGER } = this.roleCollaborationService.ROLES;

        // Check the user who what to update is ADMIN or OWNER and ACTIVE
        const checkAdminIsAdmin = (currentUserTeamData.role_collaboration || {}).title === ROLE_ADMIN;
        const checkAdminIsActive = currentUserTeamData.is_active || false;

        const checkAdminIsOwner = (currentUserTeamData.role_collaboration || {}).title === ROLE_OWNER;

        if ((!checkAdminIsAdmin && !checkAdminIsOwner) || !checkAdminIsActive) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }

        // Retrieve all the team information of the user who will be updated
        let userTeam = null;
        try {
            const userDataByTeamData = await this.userService.getUserDataByTeam(userId, adminTeamId);
            userTeam = ((userDataByTeamData.data.user[0] || {}).user_teams || [])[0] || null;
        } catch (err) {
            console.log(err);
        }

        if (userTeam === null) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }

        const isUserAdmin = (userTeam.role_collaboration || {}).title === ROLE_ADMIN;
        const isUserInvoiceManager = (userTeam.role_collaboration || {}).title === ROLE_INVOICES_MANAGER;
        const isUserOwner = (userTeam.role_collaboration || {}).title === ROLE_OWNER;

        const userIsActive = userTeam.is_active || false;

        // Retrieve all the user information of the user who will be updated
        let user = null;
        try {
            user = await this.userService.getUserById(userId);
        } catch (err) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }

        if (!user) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
        }

        const newUserData: any = {
            username: body.username,
            email: this.mailService.emailStandardize(body.email),
            technologies: body.technologies || [],
            roleName: body.roleName,
            isActive: body.isActive,
        };

        const userData = {
            username: user.username,
            email: this.mailService.emailStandardize(user.email),
            isActive: userIsActive,
            roleName: isUserAdmin ? ROLE_ADMIN : isUserInvoiceManager ? ROLE_INVOICES_MANAGER : ROLE_MEMBER,
            technologies: user.userTechnologies.length ? user.userTechnologies.map(el => el.technology.id) : [],
        };

        // OWNER can update ADMIN, MEMBER, MANAGER or partly himself
        if (checkAdminIsOwner && checkAdminIsActive) {
            newUserData.isActive = body.isActive;
            newUserData.roleName = body.roleName;

            if (isUserOwner && !(body.isActive === userData.isActive)) {
                const errorMessage = !(body.isActive === userData.isActive)
                    ? 'ERROR.USER.UPDATE_TEAM_OWNER_ACTIVE_STATUS_FAILED'
                    : 'ERROR.USER.UPDATE_USER_FAILED';

                return res.status(HttpStatus.BAD_REQUEST).json({ message: errorMessage });
            }

            if (isUserOwner && !(body.roleName === ROLE_OWNER)) {
                const errorMessage = !(body.roleName === ROLE_OWNER)
                    ? 'ERROR.USER.UPDATE_TEAM_OWNER_ROLE_FAILED'
                    : 'ERROR.USER.UPDATE_USER_FAILED';

                return res.status(HttpStatus.BAD_REQUEST).json({ message: errorMessage });
            }

            if (isUserOwner) {
                newUserData.isActive = userData.isActive;
                newUserData.roleName = ROLE_OWNER;
            }
        }

        // ADMIN can update only member, not another ADMIN, OWNER, MANAGER or himself
        if (checkAdminIsAdmin && checkAdminIsActive) {
            if (isUserInvoiceManager || body.roleName === ROLE_INVOICES_MANAGER) {
                const errorMessage =
                    body.roleName === ROLE_INVOICES_MANAGER
                        ? 'ERROR.USER.UPDATE_TEAM_ROLE_INVOICES_MANAGER_ROLE_FAILED'
                        : 'ERROR.USER.UPDATE_USER_FAILED';

                return res.status(HttpStatus.BAD_REQUEST).json({ message: errorMessage });
            }
            if (isUserAdmin) {
                const errorMessage = 'ERROR.USER.UPDATE_USER_FAILED';
                return res.status(HttpStatus.BAD_REQUEST).json({ message: errorMessage });
            }
            if (!isUserOwner && !isUserAdmin && !isUserInvoiceManager && body.roleName !== ROLE_INVOICES_MANAGER) {
                userData.roleName = ROLE_MEMBER;
                newUserData.isActive = body.isActive;
                newUserData.roleName = body.roleName;
            }
        }

        Object.keys(userData).forEach(prop => {
            const newValue = newUserData[prop];
            userData[prop] = typeof newValue === 'undefined' || newValue === null ? userData[prop] : newValue;
        });

        try {
            const teamProjectsData = ((await this.projectService.getProjectTeam(
                currentUserTeamData.team.id
            )) as AxiosResponse).data.project_v2;
            const teamProjects = teamProjectsData.map(project => project.id);

            if (
                (isUserAdmin && body.roleName === ROLE_MEMBER) ||
                (isUserAdmin && !body.isActive) ||
                ((body.roleName === ROLE_ADMIN || body.roleName === ROLE_MEMBER) && !body.isActive)
            ) {
                await this.projectService.deleteProjectUserQuery(teamProjects, [userId]);
            }

            if (!isUserOwner && body.roleName === ROLE_ADMIN && body.isActive) {
                await this.projectService.deleteProjectUserQuery(teamProjects, [userId]);
                await this.projectService.addProjectUserQuery(teamProjects, [userId]);
            }
        } catch (err) {
            console.log(err);
        }
        try {
            await this.userService.updateUserInTeam(adminId, adminTeamId, userId, userData);

            if (adminId === userId) {
                let userUpdated = null;
                try {
                    userUpdated = await this.userService.getUserById(userId);
                } catch (err) {
                    console.log(err);
                }

                if (!userUpdated) {
                    return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.UPDATE_USER_FAILED' });
                }
                return res.status(HttpStatus.OK).json(this.userService.getPublicUserData(userUpdated));
            }

            return res.status(HttpStatus.OK).json({ message: 'SUCCESS.USER.UPDATE_USER' });
        } catch (err) {
            const error: AxiosError = err;
            return res.status(HttpStatus.BAD_REQUEST).json(error.response ? error.response.data.errors : error);
        }
    }

    @Post(':id/set-social/:social')
    @UseGuards(AuthGuard())
    async setFacebook(@Headers() headers: any, @Response() res: any, @Param() param: any, @Body() body: any) {
        const userId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!userId || param.id !== userId) {
            throw new UnauthorizedException();
        }

        const socialName = param.social;
        const socialId = body.socialId;

        const user: any = await this.userService.getUserById(param.id);

        if (socialId || socialId === null) {
            try {
                const newId = await this.socialService.setSocial(user.socialId, socialName, socialId);
                return res.status(HttpStatus.OK).json({ id: newId });
            } catch (e) {
                const error: AxiosError = e;
                return res
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .json(error.response ? error.response.data.errors : error);
            }
        } else {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: 'ERROR.CHECK_REQUEST_PARAMS' });
        }
    }

    @Post(':id/team/remove-from-team')
    @UseGuards(AuthGuard())
    async deleteUserInTeam(@Headers() headers: any, @Param() param: any, @Response() res: any, @Body() body: any) {
        // The user id to delete
        const userId = param.id;

        // The admin id who want to delete the user
        const adminId = await this.authService.getVerifiedUserId(headers.authorization);
        if (!adminId) {
            throw new UnauthorizedException();
        }

        // An array of current teams information
        let currentUserTeamData = null;
        try {
            const currentTeamRes = await this.teamService.getCurrentTeam(adminId);
            currentUserTeamData = (currentTeamRes.data.user_team || [])[0] || null;
        } catch (err) {
            console.log(err);
        }

        if (currentUserTeamData === null) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.DELETE_USER_FROM_TEAM_FAILED' });
        }

        // The id of the current admin's team
        const adminTeamId = (currentUserTeamData.team || {}).id;

        if (!adminTeamId) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.DELETE_USER_FROM_TEAM_FAILED' });
        }

        // Check the user who want to delete is ADMIN and ACTIVE
        const checkAdminIsAdmin =
            (currentUserTeamData.role_collaboration || {}).title === this.roleCollaborationService.ROLES.ROLE_ADMIN;
        const checkAdminIsActive = currentUserTeamData.is_active || false;

        const checkAdminIsOwner =
            (currentUserTeamData.role_collaboration || {}).title === this.roleCollaborationService.ROLES.ROLE_OWNER;

        if ((!checkAdminIsAdmin && !checkAdminIsOwner) || !checkAdminIsActive) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.DELETE_USER_FROM_TEAM_FAILED' });
        }

        let current = null;

        // Retrieve all the team information of the user who will be deleted
        let userTeam = null;
        try {
            const userDataByTeamData = await this.userService.getUserDataByTeam(userId, adminTeamId);
            current = userDataByTeamData.data.user[0].user_teams[0].current_team;
            userTeam = ((userDataByTeamData.data.user[0] || {}).user_teams || [])[0] || null;
        } catch (err) {
            console.log(err);
        }

        if (userTeam === null) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: 'ERROR.USER.DELETE_USER_FROM_TEAM_FAILED' });
        }

        const userIsAdmin =
            (userTeam.role_collaboration || {}).title === this.roleCollaborationService.ROLES.ROLE_ADMIN;
        const userIsActive = userTeam.is_active || false;
        const userIsOwner =
            (userTeam.role_collaboration || {}).title === this.roleCollaborationService.ROLES.ROLE_OWNER;

        try {
            //If admin is OWNER and ACTIVE, he can delete ADMIN and MEMBER, but not himself
            if (checkAdminIsOwner && !userIsOwner && userIsActive && checkAdminIsActive) {
                if (current) {
                    const userOwnerTeams = await this.teamService.getOwnerUserTeams(userId);
                    await this.teamService.switchTeam(userId, userOwnerTeams.data.team[0].id);
                }

                const teamProjectsData = ((await this.projectService.getProjectTeam(
                    currentUserTeamData.team.id
                )) as AxiosResponse).data.project_v2;
                const teamProjects = teamProjectsData.map(project => project.id);
                await this.projectService.deleteProjectUserQuery(teamProjects, [userId]);

                await this.userService.deleteUserFromTeam(adminTeamId, userId);
                return res.status(HttpStatus.OK).json({ message: 'SUCCESS.USER.DELETE_USER_FROM_TEAM_SUCCEED' });
            }

            //If admin is ADMIN and ACTIVE, he can delete only MEMBER, but can`t delete another ADMIN and OWNER
            if (checkAdminIsAdmin && !userIsOwner && !userIsAdmin && checkAdminIsActive) {
                if (current) {
                    const userOwnerTeams = await this.teamService.getOwnerUserTeams(userId);
                    await this.teamService.switchTeam(userId, userOwnerTeams.data.team[0].id);
                }

                const teamProjectsData = ((await this.projectService.getProjectTeam(
                    currentUserTeamData.team.id
                )) as AxiosResponse).data.project_v2;
                const teamProjects = teamProjectsData.map(project => project.id);
                await this.projectService.deleteProjectUserQuery(teamProjects, [userId]);

                await this.userService.deleteUserFromTeam(adminTeamId, userId);
                return res.status(HttpStatus.OK).json({ message: 'SUCCESS.USER.DELETE_USER_FROM_TEAM_SUCCEED' });
            }
        } catch (err) {
            const error: AxiosError = err;
            return res.status(HttpStatus.BAD_REQUEST).json(error.response ? error.response.data.errors : error);
        }
    }
}
