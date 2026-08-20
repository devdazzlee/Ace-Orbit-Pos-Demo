import { z } from "zod"

const REQUIRED = "this is required"

export const employeeFormSchema = z.object({
  name: z.string().trim().min(1, REQUIRED),
  email: z.string().trim().min(1, REQUIRED).email("Invalid email address"),
  phone_number: z.string().optional(),
  cnic: z.string().optional(),
  gender: z.string().optional(),
  join_date: z.date().nullable().optional(),
  employee_type_id: z.string().optional(),
})

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>

export type EmployeeFormErrors = Partial<Record<keyof EmployeeFormValues, string>>

export function validateEmployeeForm(
  data: EmployeeFormValues
): { success: true } | { success: false; errors: EmployeeFormErrors } {
  const result = employeeFormSchema.safeParse(data)
  if (result.success) {
    return { success: true }
  }
  const errors: EmployeeFormErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof EmployeeFormValues
    if (key && !errors[key]) {
      errors[key] = issue.message
    }
  }
  return { success: false, errors }
}
