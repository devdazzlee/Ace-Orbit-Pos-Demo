"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import { Lock, User, Eye, EyeOff, Mail, ShieldCheck, BadgeCheck, Loader2 } from "lucide-react"
import apiClient from "@/lib/apiClient"
import { useToast } from "@/hooks/use-toast"
import { Separator } from "@/components/ui/separator"

export function Profile() {
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [userInfo, setUserInfo] = useState({
    email: "",
    role: "",
  })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fetchingInfo, setFetchingInfo] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const fetchUserData = async () => {
      const storedEmail = localStorage.getItem("email")
      const storedRole = localStorage.getItem("role")

      if (storedEmail && storedRole && storedEmail !== "undefined" && storedRole !== "undefined") {
        setUserInfo({ email: storedEmail, role: storedRole })
      } else {
        setFetchingInfo(true)
        try {
          const response = await apiClient.get("/auth/me")
          console.log("Profile Me Response:", JSON.stringify(response.data))
          if (response.data.success && response.data.data) {
            const user = response.data.data
            console.log("User Object From API:", JSON.stringify(user))
            const email = user.email || "Not available"
            setUserInfo({ email, role: user.role || "N/A" })
            localStorage.setItem("email", email)
            localStorage.setItem("role", user.role || "N/A")
          }
        } catch (error) {
          console.error("Failed to fetch user data:", error)
          setUserInfo({
            email: storedEmail || "Not available",
            role: storedRole || "N/A",
          })
        } finally {
          setFetchingInfo(false)
        }
      }
    }

    fetchUserData()
  }, [])

  const handleUpdatePassword = async () => {
    if (!passwords.currentPassword) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Current password is required",
      })
      return
    }

    if (passwords.newPassword !== passwords.confirmPassword) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "New passwords do not match!",
      })
      return
    }

    if (passwords.newPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "New password must be at least 6 characters long",
      })
      return
    }

    setLoading(true)
    try {
      const response = await apiClient.post("/auth/change-password", {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      })

      if (response.data.success) {
        toast({
          variant: "success",
          title: "Success",
          description: "Password updated successfully!",
        })
        setPasswords({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        })
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.message || "Failed to update password",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8 lg:p-12 bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50/30">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">Account Settings</h1>
          <p className="text-muted-foreground text-lg">Manage your personal information and security preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Personal Info */}
          <Card className="lg:col-span-1 shadow-xl shadow-blue-900/5 border-slate-200/60 overflow-hidden">
            <div className="h-2 bg-blue-600 w-full" />
            <CardHeader className="pb-4">
              <CardTitle className="text-xl flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                Personal Information
              </CardTitle>
              <CardDescription>Your account details and permissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {fetchingInfo ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                  <p className="text-sm text-muted-foreground font-medium">Fetching account details...</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 p-1.5 bg-slate-100 rounded-md">
                        <Mail className="h-4 w-4 text-slate-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">Email Address</Label>
                        <p className="text-slate-900 font-medium truncate">{userInfo.email}</p>
                      </div>
                    </div>

                    <Separator className="bg-slate-100" />

                    <div className="flex items-start gap-3">
                      <div className="mt-1 p-1.5 bg-slate-100 rounded-md">
                        <BadgeCheck className="h-4 w-4 text-slate-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">Account Role</Label>
                        <p className="text-slate-900 font-medium">{userInfo.role}</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100/50 flex items-center gap-3">
                       <ShieldCheck className="h-8 w-8 text-blue-500 opacity-50" />
                       <p className="text-sm text-blue-800 leading-tight">
                         Your account is protected with role-based access control.
                       </p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Right Column: Change Password */}
          <Card className="lg:col-span-2 shadow-xl shadow-blue-900/5 border-slate-200/60 overflow-hidden">
            <div className="h-2 bg-slate-800 w-full" />
            <CardHeader className="pb-6">
              <CardTitle className="text-xl flex items-center gap-2.5">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <Lock className="h-5 w-5 text-slate-700" />
                </div>
                Change Password
              </CardTitle>
              <CardDescription>Update your password to keep your account secure</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative group">
                    <Input
                      id="currentPassword"
                      type={showCurrent ? "text" : "password"}
                      placeholder="Enter current password"
                      value={passwords.currentPassword}
                      onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                      className="h-11 pr-10 focus:ring-blue-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(!showCurrent)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative group">
                    <Input
                      id="newPassword"
                      type={showNew ? "text" : "password"}
                      placeholder="Enter new password"
                      value={passwords.newPassword}
                      onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                      className="h-11 pr-10 focus:ring-blue-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative group">
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      placeholder="Confirm new password"
                      value={passwords.confirmPassword}
                      onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                      className="h-11 pr-10 focus:ring-blue-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4 items-center justify-between border-t border-slate-100 pt-6">
                 <p className="text-sm text-muted-foreground max-w-xs">
                   Password must be at least 6 characters long and include numbers or symbols for better security.
                 </p>
                 <LoadingButton
                  onClick={handleUpdatePassword}
                  className="w-full sm:w-auto h-11 px-8 bg-slate-900 hover:bg-slate-800 shadow-lg shadow-slate-900/10 transition-all hover:-translate-y-0.5 active:translate-y-0"
                  loading={loading}
                >
                  Update Password
                </LoadingButton>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
