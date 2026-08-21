import { createBrowserRouter } from "react-router"
import App from "./pages/App"
import WorkPlanManager from "./pages/WorkPlanManager"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <WorkPlanManager />,
  },
])
