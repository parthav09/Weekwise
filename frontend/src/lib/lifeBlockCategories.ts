import {
  Bed,
  Briefcase,
  Car,
  Coffee,
  Dumbbell,
  GraduationCap,
  Shield,
  Sparkles,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react"

import type { LifeBlockCategory } from "./api"

interface CategoryDescriptor {
  label: string
  icon: LucideIcon
  className: string
}

export const lifeBlockCategoryConfig: Record<LifeBlockCategory, CategoryDescriptor> = {
  sleep: {
    label: "Sleep",
    icon: Bed,
    className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200",
  },
  workout: { label: "Workout", icon: Dumbbell, className: "bg-success/10 text-success" },
  commute: { label: "Commute", icon: Car, className: "bg-warning/10 text-warning" },
  meal: {
    label: "Meal",
    icon: Coffee,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
  },
  class_: { label: "Class", icon: GraduationCap, className: "bg-primary/10 text-primary" },
  work: { label: "Work", icon: Briefcase, className: "bg-muted text-muted-foreground" },
  social: {
    label: "Social",
    icon: Users,
    className: "bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-200",
  },
  focus: { label: "Focus", icon: Sparkles, className: "bg-accent/10 text-accent" },
  free: {
    label: "Free time",
    icon: Sun,
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-200",
  },
  other: { label: "Other", icon: Shield, className: "bg-muted text-muted-foreground" },
}
