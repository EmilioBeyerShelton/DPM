import { createBrowserRouter } from "react-router"
import WorkPlanManager from "./pages/WorkPlanManager"
import BoundingBoxEditor from "./pages/BoundingBoxEditor"

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <WorkPlanManager />,
    },
    {
      path: "/editor",
      element: <BoundingBoxEditor />,
    },
  ],
  { basename: "/DPM/" }
)
