import type { RegisterFormData, LoginFormData, FieldErrors } from "@/types/auth"



export function isValidEmail(email: string): boolean {
  return /^\S+@\S+\.\S+$/.test(email)
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8
}

export function isValidFullName(fullName: string): boolean {
  return fullName.trim().length > 0
}



export function validateRegister(
  data: RegisterFormData,
  confirmPassword: string
): FieldErrors<RegisterFormData & { confirmPassword: string }> {
  const errors: FieldErrors<RegisterFormData & { confirmPassword: string }> = {}

  if (!isValidFullName(data.fullName)) {
    errors.fullName = "Full name is required"
  }

  if (!isValidEmail(data.email)) {
    errors.email = "Please enter a valid email"
  }

  if (!isValidPassword(data.password)) {
    errors.password = "Password must be at least 8 characters"
  }

  if (data.password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match"
  }

  return errors
}



export function validateLogin(data: LoginFormData): FieldErrors<LoginFormData> {
  const errors: FieldErrors<LoginFormData> = {}

  if (!isValidEmail(data.email)) {
    errors.email = "Please enter a valid email"
  }

  if (!isValidPassword(data.password)) {
    errors.password = "Password must be at least 8 characters"
  }

  return errors
}



export function hasErrors(
  errors: FieldErrors<any>
): boolean {
  return Object.values(errors).some(err => err !== undefined)
}
