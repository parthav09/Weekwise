import { Navigate, Route, Routes } from "react-router-dom"

import { AppLayout } from "./components/AppLayout"
import { WhoopBleLayout } from "./components/whoop/WhoopBleLayout"
import { DailyPage } from "./pages/DailyPage"
import { DashboardPage } from "./pages/DashboardPage"
import { GroceriesPage } from "./pages/GroceriesPage"
import { HabitsPage } from "./pages/HabitsPage"
import { InboxPage } from "./pages/InboxPage"
import { LifeBlocksPage } from "./pages/LifeBlocksPage"
import { SettingsPage } from "./pages/SettingsPage"
import { TasksPage } from "./pages/TasksPage"
import { WeeklyPlanPage } from "./pages/WeeklyPlanPage"
import { WhoopDiagnosticsPage } from "./pages/whoop/WhoopDiagnosticsPage"
import { WhoopHistoryPage } from "./pages/whoop/WhoopHistoryPage"
import { WhoopLivePage } from "./pages/whoop/WhoopLivePage"
import { WhoopRawRecordsPage } from "./pages/whoop/WhoopRawRecordsPage"

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="today" element={<DailyPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="habits" element={<HabitsPage />} />
        <Route path="groceries" element={<GroceriesPage />} />
        <Route path="life-blocks" element={<LifeBlocksPage />} />
        <Route path="weekly-plan" element={<WeeklyPlanPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="whoop" element={<WhoopBleLayout />}>
          <Route index element={<Navigate to="live" replace />} />
          <Route path="live" element={<WhoopLivePage />} />
          <Route path="history" element={<WhoopHistoryPage />} />
          <Route path="diagnostics" element={<WhoopDiagnosticsPage />} />
          <Route path="raw" element={<WhoopRawRecordsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

