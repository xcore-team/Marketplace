export type RegisterFormData = {
    fullName: string;
    email: string;
    password: string;
}

export type LoginFormData = {
    email: string;
    password: string;
}

export interface AuthError{
    message: string;
}