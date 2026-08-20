"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Search, Plus, Edit, Trash2, Loader2, Users } from "lucide-react"
import apiClient from "@/lib/apiClient"
import { useToast } from "@/hooks/use-toast"
import { PageLoader } from "@/components/ui/page-loader"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  validateEmployeeForm,
  type EmployeeFormErrors,
} from "@/lib/validations/employee"
import {
  EmployeeDesignationField,
  type EmployeeDesignation,
} from "@/components/employee-designation-field"

interface Employee {
  id: string
  name: string
  email?: string
  phone_number?: string
  cnic?: string
  gender?: string
  join_date?: string | Date | null
  employee_type_id?: string
  employee_type?: { id: string; name: string }
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-sm text-red-600 mt-1">{message}</p>
}

const EMPLOYEE_DIALOG_CLASS =
  "sm:max-w-2xl w-[calc(100vw-2rem)] max-h-[min(90vh,720px)] flex flex-col gap-0 p-0 overflow-hidden translate-y-[-50%] top-[50%]"

function FormField({
  label,
  htmlFor,
  required,
  optional,
  children,
  className,
}: {
  label: string
  htmlFor: string
  required?: boolean
  optional?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
        {required && <span className="text-red-500">*</span>}
        {optional && (
          <span className="text-gray-400 font-normal"> (optional)</span>
        )}
      </Label>
      {children}
    </div>
  )
}

function buildEmployeeApiPayload(data: {
  name: string
  email: string
  phone_number?: string
  cnic?: string
  gender?: string
  join_date?: Date | null
  employee_type_id?: string
}) {
  const payload: Record<string, string> = {
    name: data.name.trim(),
    email: data.email.trim(),
  }
  if (data.phone_number?.trim()) payload.phone_number = data.phone_number.trim()
  if (data.cnic?.trim()) payload.cnic = data.cnic.trim()
  if (data.gender?.trim()) payload.gender = data.gender.trim()
  if (data.join_date) payload.join_date = data.join_date.toISOString()
  if (data.employee_type_id) payload.employee_type_id = data.employee_type_id
  return payload
}

interface NewEmployeeForm {
  name: string
  email: string
  phone_number: string
  cnic: string
  gender: string
  join_date: string
  employee_type_id: string
}

type EmployeeType = EmployeeDesignation

export function EmployeeManagement() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeTypes, setEmployeeTypes] = useState<EmployeeType[]>([])
  const [typesLoading, setTypesLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<(Employee & { join_date: Date | null }) | null>(null)
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null)
  const [newEmployee, setNewEmployee] = useState<NewEmployeeForm & { join_date: Date | null }>({
    name: "",
    email: "",
    phone_number: "",
    cnic: "",
    gender: "",
    join_date: null,
    employee_type_id: "",
  })
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [addFormErrors, setAddFormErrors] = useState<EmployeeFormErrors>({})
  const [editFormErrors, setEditFormErrors] = useState<EmployeeFormErrors>({})

  // Fetch employees from API
  const getEmployees = async () => {
    setLoading(true)
    try {
      const res = await apiClient.get("/employee", { params: { page: 1, limit: 500 } })
      // Convert join_date to Date object for all employees
      setEmployees(res.data.data.map((emp: Employee) => ({ ...emp, join_date: emp.join_date ? new Date(emp.join_date) : null })))
    } catch (error) {
      console.log("Get employees error", error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch employee types
  const getEmployeeTypes = async () => {
    setTypesLoading(true)
    try {
      const res = await apiClient.get("/employee/types")
      setEmployeeTypes(res.data.data)
    } catch (error) {
      setEmployeeTypes([])
    } finally {
      setTypesLoading(false)
    }
  }

  useEffect(() => {
    setIsInitialLoading(true)
    getEmployees().finally(() => setIsInitialLoading(false))
    getEmployeeTypes()
  }, [])

  const resetAddForm = () => {
    setNewEmployee({
      name: "",
      email: "",
      phone_number: "",
      cnic: "",
      gender: "",
      join_date: null,
      employee_type_id: "",
    })
    setAddFormErrors({})
  }

  // Add employee
  const handleAddEmployee = async () => {
    const validation = validateEmployeeForm(newEmployee)
    if (!validation.success) {
      setAddFormErrors(validation.errors)
      return
    }
    setAddFormErrors({})
    setActionLoading(true)
    try {
      const payload = buildEmployeeApiPayload(newEmployee)
      await apiClient.post("/employee", payload)
      toast({
        title: "Success",
        description: "Employee added successfully",
      })
      setIsAddDialogOpen(false)
      resetAddForm()
      getEmployees()
    } catch (error: any) {
      console.log("Add employee error", error)
      toast({
        title: "Error",
        description: error?.response?.data?.message || "Failed to add employee",
        variant: "destructive",
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Edit employee
  const openEditDialog = (employee: Employee) => {
    setEditFormErrors({})
    setEditingEmployee({
      ...employee,
      email: employee.email ?? "",
      join_date: employee.join_date ? new Date(employee.join_date) : null,
    })
    setIsEditDialogOpen(true)
  }

  const handleEditEmployee = async () => {
    if (!editingEmployee) return
    const validation = validateEmployeeForm({
      name: editingEmployee.name,
      email: editingEmployee.email ?? "",
      phone_number: editingEmployee.phone_number,
      cnic: editingEmployee.cnic,
      gender: editingEmployee.gender,
      join_date: editingEmployee.join_date,
      employee_type_id: editingEmployee.employee_type_id,
    })
    if (!validation.success) {
      setEditFormErrors(validation.errors)
      return
    }
    setEditFormErrors({})
    setActionLoading(true)
    try {
      const payload = buildEmployeeApiPayload({
        name: editingEmployee.name,
        email: editingEmployee.email ?? "",
        phone_number: editingEmployee.phone_number,
        cnic: editingEmployee.cnic,
        gender: editingEmployee.gender,
        join_date: editingEmployee.join_date,
        employee_type_id: editingEmployee.employee_type_id,
      })
      await apiClient.put(`/employee/${editingEmployee.id}`, payload)
      toast({
        title: "Success",
        description: "Employee updated successfully",
      })
      setIsEditDialogOpen(false)
      setEditingEmployee(null)
      getEmployees()
    } catch (error: any) {
      console.log("Edit employee error", error)
      toast({
        title: "Error",
        description: error?.response?.data?.message || "Failed to update employee",
        variant: "destructive",
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Delete employee
  const openDeleteDialog = (employee: Employee) => {
    setDeletingEmployee(employee)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteEmployee = async () => {
    if (deletingEmployee) {
      setActionLoading(true)
      try {
        await apiClient.delete(`/employee/${deletingEmployee.id}`)
        toast({
          title: "Success",
          description: "Employee deleted successfully",
        })
        setIsDeleteDialogOpen(false)
        setDeletingEmployee(null)
        getEmployees()
      } catch (error: any) {
        console.log("Delete employee error", error)
        toast({
          title: "Error",
          description: error?.response?.data?.message || "Failed to delete employee",
          variant: "destructive",
        })
      } finally {
        setActionLoading(false)
      }
    }
  }

  // Filtered employees
  const filteredEmployees = employees.filter(
    (employee) =>
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (employee.email && employee.email.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Stats
  const totalEmployees = employees.length

  if (isInitialLoading) {
    return <PageLoader message="Loading employees data..." />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Stats Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {isInitialLoading ? (
          <StatCardSkeleton />
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEmployees}</div>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Employee Management</h1>
          <p className="text-sm md:text-base text-gray-600">Manage your team</p>
        </div>
        {/* Add Employee Dialog */}
        <Dialog
          open={isAddDialogOpen}
          onOpenChange={(open) => {
            setIsAddDialogOpen(open)
            if (!open) resetAddForm()
          }}
        >
          <DialogTrigger asChild>
            <Button>Add Employee</Button>
          </DialogTrigger>
          <DialogContent className={EMPLOYEE_DIALOG_CLASS}>
            <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
              <DialogTitle>Add New Employee</DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <FormField label="Full Name" htmlFor="name" required>
                  <Input
                    id="name"
                    value={newEmployee.name}
                    onChange={(e) => {
                      setNewEmployee({ ...newEmployee, name: e.target.value })
                      if (addFormErrors.name) setAddFormErrors((prev) => ({ ...prev, name: undefined }))
                    }}
                    placeholder="Enter full name"
                    disabled={actionLoading}
                    className={addFormErrors.name ? "border-red-500" : ""}
                  />
                  <FieldError message={addFormErrors.name} />
                </FormField>
                <FormField label="Email" htmlFor="email" required>
                  <Input
                    id="email"
                    type="email"
                    value={newEmployee.email}
                    onChange={(e) => {
                      setNewEmployee({ ...newEmployee, email: e.target.value })
                      if (addFormErrors.email) setAddFormErrors((prev) => ({ ...prev, email: undefined }))
                    }}
                    placeholder="Enter email address"
                    disabled={actionLoading}
                    className={addFormErrors.email ? "border-red-500" : ""}
                  />
                  <FieldError message={addFormErrors.email} />
                </FormField>
                <FormField label="Join Date" htmlFor="join_date" optional>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full h-9 justify-start text-left font-normal",
                          !newEmployee.join_date && "text-muted-foreground"
                        )}
                      >
                        {newEmployee.join_date ? newEmployee.join_date.toLocaleDateString() : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={newEmployee.join_date}
                        onSelect={(date) => setNewEmployee({ ...newEmployee, join_date: date })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </FormField>
                <FormField label="Phone" htmlFor="phone_number" optional>
                  <Input
                    id="phone_number"
                    value={newEmployee.phone_number}
                    onChange={(e) => setNewEmployee({ ...newEmployee, phone_number: e.target.value })}
                    placeholder="Phone number"
                    disabled={actionLoading}
                  />
                </FormField>
                <FormField label="CNIC" htmlFor="cnic" optional>
                  <Input
                    id="cnic"
                    value={newEmployee.cnic}
                    onChange={(e) => setNewEmployee({ ...newEmployee, cnic: e.target.value })}
                    placeholder="CNIC"
                    disabled={actionLoading}
                  />
                </FormField>
                <FormField label="Gender" htmlFor="gender" optional>
                  <Input
                    id="gender"
                    value={newEmployee.gender}
                    onChange={(e) => setNewEmployee({ ...newEmployee, gender: e.target.value })}
                    placeholder="Gender"
                    disabled={actionLoading}
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <EmployeeDesignationField
                    id="employee_type_id"
                    labelId="employee_type_id"
                    value={newEmployee.employee_type_id}
                    onChange={(designationId) =>
                      setNewEmployee({ ...newEmployee, employee_type_id: designationId })
                    }
                    designations={employeeTypes}
                    onDesignationsUpdated={setEmployeeTypes}
                    disabled={actionLoading}
                    loading={typesLoading}
                    compact
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="shrink-0 px-6 py-4 border-t bg-background">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button onClick={handleAddEmployee} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                Add Employee
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search employees..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>
      {/* Employees Table */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageLoader message="Loading employees..." />
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-10">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No employees found</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Name</TableHead>
                      <TableHead className="min-w-[180px]">Email</TableHead>
                      <TableHead className="min-w-[120px]">Phone</TableHead>
                      <TableHead className="min-w-[120px]">CNIC</TableHead>
                      <TableHead className="min-w-[80px]">Gender</TableHead>
                      <TableHead className="min-w-[120px]">Join Date</TableHead>
                      <TableHead className="min-w-[120px]">Designation</TableHead>
                      <TableHead className="min-w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {filteredEmployees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>{employee.name}</TableCell>
                    <TableCell>{employee.email || "-"}</TableCell>
                    <TableCell>{employee.phone_number || "-"}</TableCell>
                    <TableCell>{employee.cnic || "-"}</TableCell>
                    <TableCell>{employee.gender || "-"}</TableCell>
                    <TableCell>{employee.join_date ? new Date(employee.join_date).toISOString().slice(0, 10) : "-"}</TableCell>
                    <TableCell>
                      {employee.employee_type?.name ||
                        employeeTypes.find((t) => t.id === employee.employee_type_id)?.name ||
                        "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-1">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(employee)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDeleteDialog(employee)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Edit Employee Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className={EMPLOYEE_DIALOG_CLASS}>
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          {editingEmployee && (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <FormField label="Full Name" htmlFor="edit-name" required>
                  <Input
                    id="edit-name"
                    value={editingEmployee.name}
                    onChange={(e) => {
                      setEditingEmployee({ ...editingEmployee, name: e.target.value })
                      if (editFormErrors.name) setEditFormErrors((prev) => ({ ...prev, name: undefined }))
                    }}
                    disabled={actionLoading}
                    className={editFormErrors.name ? "border-red-500" : ""}
                  />
                  <FieldError message={editFormErrors.name} />
                </FormField>
                <FormField label="Email" htmlFor="edit-email" required>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editingEmployee.email ?? ""}
                    onChange={(e) => {
                      setEditingEmployee({ ...editingEmployee, email: e.target.value })
                      if (editFormErrors.email) setEditFormErrors((prev) => ({ ...prev, email: undefined }))
                    }}
                    disabled={actionLoading}
                    className={editFormErrors.email ? "border-red-500" : ""}
                  />
                  <FieldError message={editFormErrors.email} />
                </FormField>
                <FormField label="Join Date" htmlFor="edit-join_date" optional>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full h-9 justify-start text-left font-normal",
                          !editingEmployee?.join_date && "text-muted-foreground"
                        )}
                      >
                        {editingEmployee?.join_date ? editingEmployee.join_date.toLocaleDateString() : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={editingEmployee?.join_date || null}
                        onSelect={(date) =>
                          setEditingEmployee(editingEmployee ? { ...editingEmployee, join_date: date } : null)
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </FormField>
                <FormField label="Phone" htmlFor="edit-phone_number" optional>
                  <Input
                    id="edit-phone_number"
                    value={editingEmployee.phone_number ?? ""}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, phone_number: e.target.value })}
                    disabled={actionLoading}
                  />
                </FormField>
                <FormField label="CNIC" htmlFor="edit-cnic" optional>
                  <Input
                    id="edit-cnic"
                    value={editingEmployee.cnic ?? ""}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, cnic: e.target.value })}
                    disabled={actionLoading}
                  />
                </FormField>
                <FormField label="Gender" htmlFor="edit-gender" optional>
                  <Input
                    id="edit-gender"
                    value={editingEmployee.gender ?? ""}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, gender: e.target.value })}
                    disabled={actionLoading}
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <EmployeeDesignationField
                    id="edit-employee_type_id"
                    labelId="edit-employee_type_id"
                    value={editingEmployee.employee_type_id}
                    onChange={(designationId) =>
                      setEditingEmployee({
                        ...editingEmployee,
                        employee_type_id: designationId,
                      })
                    }
                    designations={employeeTypes}
                    onDesignationsUpdated={setEmployeeTypes}
                    disabled={actionLoading}
                    loading={typesLoading}
                    compact
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="shrink-0 px-6 py-4 border-t bg-background">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button onClick={handleEditEmployee} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
              Update Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Employee</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>
              Are you sure you want to delete <strong>{deletingEmployee?.name}</strong>?
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Linked salary and shift records will also be removed. This cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteEmployee} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
              Delete Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
