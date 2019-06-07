import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';

@Injectable()
export class BearerStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly jwtService: JwtService) {
        super();
    }

    async validate(token: string): Promise<any> {
        try {
            await this.jwtService.verify(token);
        } catch (e) {
            throw new UnauthorizedException();
        }

        return token;
    }
}
