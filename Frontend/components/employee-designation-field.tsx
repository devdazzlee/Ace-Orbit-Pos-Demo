"use client"

import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Plus } from "lucide-react"
import apiClient from "@/lib/apiClient"
import { useToast } from "@/hooks/use-toast"

export interface EmployeeDesignation {
  id: string
  name: string
}

interface EmployeeDesignationFieldProps {
  id: string
  labelId?: string
  value?: string
  onChange: (designationId: string) => void
  designations: EmployeeDesignation[]
  onDesignationsUpdated: (designations: EmployeeDesignation[]) => void
  disabled?: boolean
  loading?: boolean
  /** Tighter layout for dialogs */
  compact?: boolean
}

export function EmployeeDesignationField({
  id,
  labelId,
  value,
  onChange,
  designations,
  onDesignationsUpdated,
  disabled = false,
  loading = false,
  compact = false,
}: EmployeeDesignationFieldProps) {
  const { toast } = useToast()
  const [newName, setNewName] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState("")

  const handleAddDesignation = async () => {
    const trimmed = newName.trim()
    if (trimmed.length < 2) {
      setAddError("Designation name must be at least 2 characters")
      return
    }
    const exists = designations.some(
      (d) => d.name.toLowerCase() === trimmed.toLowerCase()
    )
    if (exists) {
      const match = designations.find(
        (d) => d.name.toLowerCase() === trimmed.toLowerCase()
      )
      if (match) onChange(match.id)
      setNewName("")
      setAddError("")
      toast({ title: "Already exists", description: `"${match?.name}" is already in the list.` })
      return
    }

    setIsAdding(true)
    setAddError("")
    try {
      const res = await apiClient.post("/employee/type", { name: trimmed })
      const created = res.data?.data as EmployeeDesignation
      const updated = [...designations, created].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
      onDesignationsUpdated(updated)
      onChange(created.id)
      setNewName("")
      toast({
        title: "Designation added",
        description: `"${created.name}" is now selected.`,
      })
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to add designation"
      setAddError(message)
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <Label htmlFor={labelId ?? id} className={compact ? "text-sm" : undefined}>
        Employee designation{" "}
        <span className="text-gray-400 font-normal">(optional)</span>
      </Label>
      <Select
        value={value || undefined}
        onValueChange={onChange}
        disabled={disabled || loading || isAdding}
      >
        <SelectTrigger id={labelId ?? id} className={compact ? "h-9" : undefined}>
          <SelectValue
            placeholder={
              loading
                ? "Loading..."
                : designations.length === 0
                  ? "General (default if empty)"
                  : "Select designation"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {designations.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!compact && designations.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground">
          No designations yet — leave empty to use &quot;General&quot;, or add one below.
        </p>
      )}

      <div
        className={
          compact
            ? "flex flex-col gap-1.5 sm:flex-row sm:items-center"
            : "rounded-md border bg-muted/30 p-3 space-y-2"
        }
      >
        {!compact && (
          <p className="text-xs font-medium text-muted-foreground">
            Add new designation
          </p>
        )}
        {compact && (
          <span className="text-xs text-muted-foreground shrink-0 sm:w-28">
            Or add new:
          </span>
        )}
        <div className="flex flex-1 gap-2 min-w-0">
          <Input
            value={newName}
            className={compact ? "h-9" : undefined}
            onChange={(e) => {
              setNewName(e.target.value)
              if (addError) setAddError("")
            }}
            placeholder="e.g. Cashier, Manager"
            disabled={disabled || isAdding}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void handleAddDesignation()
              }
            }}
          />
          <Button
            type="button"
            variant={compact ? "outline" : "secondary"}
            size={compact ? "sm" : "icon"}
            className={compact ? "shrink-0 h-9 px-3" : "shrink-0"}
            disabled={disabled || isAdding || !newName.trim()}
            onClick={() => void handleAddDesignation()}
            title="Add designation"
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : compact ? (
              "Add"
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
        {addError ? <p className="text-xs text-red-600 sm:col-span-2">{addError}</p> : null}
      </div>
    </div>
  )
}
