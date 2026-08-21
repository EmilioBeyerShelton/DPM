import { createBrowserRouter } from "react-router"
import App from "./pages/App"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
])
