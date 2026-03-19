import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/layout";
import { useAuthStore } from "@/lib/auth";
import { AddRecipePage } from "@/pages/add-recipe";
import { LoginPage } from "@/pages/login";
import { MealPlanPage } from "@/pages/meal-plan";
import { MealPlanDetailPage } from "@/pages/meal-plan-detail";
import { MealPlansPage } from "@/pages/meal-plans";
import { RecipePage } from "@/pages/recipe";
import { RecipesPage } from "@/pages/recipes";
import "./index.css";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<RecipesPage />} />
            <Route path="recipe/:id" element={<RecipePage />} />
            <Route path="meal-plans" element={<MealPlansPage />} />
            <Route path="meal-plans/:id" element={<MealPlanDetailPage />} />
            <Route path="meal-plan/new" element={<MealPlanPage />} />
            <Route path="add-recipe" element={<AddRecipePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
