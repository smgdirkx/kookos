import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/layout";
import { useAuthStore } from "@/lib/auth";
import { AddRecipePage } from "@/pages/add-recipe";
import { AdminPage } from "@/pages/admin";
import { CommunityRecipesPage } from "@/pages/community-recipes";
import { ExternalRecipesPage } from "@/pages/external-recipes";
import { LoginPage } from "@/pages/login";
import { MealPlanPage } from "@/pages/meal-plan";
import { MealPlanDetailPage } from "@/pages/meal-plan-detail";
import { MealPlansPage } from "@/pages/meal-plans";
import { RecipePage } from "@/pages/recipe";
import { RecipesPage } from "@/pages/recipes";
import { RegisterPage } from "@/pages/register";
import { SettingsPage } from "@/pages/settings";
import { SharedRecipesPage } from "@/pages/shared-recipes";
import { ShoppingListDetailPage } from "@/pages/shopping-list-detail";
import { ShoppingListsPage } from "@/pages/shopping-lists";
import "./index.css";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user?.email.endsWith("@drkx.nl")) return <Navigate to="/" replace />;
  return <>{children}</>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
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
            <Route path="shopping-lists" element={<ShoppingListsPage />} />
            <Route path="shopping-lists/:id" element={<ShoppingListDetailPage />} />
            <Route path="add-recipe" element={<AddRecipePage />} />
            <Route path="add-recipe/community" element={<CommunityRecipesPage />} />
            <Route path="add-recipe/groentenabonnement" element={<ExternalRecipesPage />} />
            <Route path="shared-recipes" element={<SharedRecipesPage />} />
            <Route path="instellingen" element={<SettingsPage />} />
            <Route
              path="admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
