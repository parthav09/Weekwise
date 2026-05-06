import { Navigate, Route, Routes } from "react-router-dom"

import { AppLayout } from "./components/AppLayout"
import { DailyPage } from "./pages/DailyPage"
import { DashboardPage } from "./pages/DashboardPage"
import { HabitsPage } from "./pages/HabitsPage"
import { LifeBlocksPage } from "./pages/LifeBlocksPage"
import { SettingsPage } from "./pages/SettingsPage"
import { TasksPage } from "./pages/TasksPage"
import { WeeklyPlanPage } from "./pages/WeeklyPlanPage"

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="today" element={<DailyPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="habits" element={<HabitsPage />} />
        <Route path="life-blocks" element={<LifeBlocksPage />} />
        <Route path="weekly-plan" element={<WeeklyPlanPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

