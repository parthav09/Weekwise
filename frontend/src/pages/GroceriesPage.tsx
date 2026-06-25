import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Plus,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Trash2,
} from "lucide-react"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"

import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import {
  addGroceryItem,
  createGroceryList,
  deleteGroceryItem,
  deleteGroceryList,
  generateMealPlan,
  getGroceryList,
  getInstacartHandoff,
  getPantry,
  listGroceryLists,
  mealPlanToGroceryList,
  suggestGroceryItems,
  syncInstacartReceipts,
  updateGroceryItem,
  updateGroceryList,
  type GroceryItemCategory,
  type GroceryItemStatus,
  type GroceryList,
  type GroceryListItem,
  type GroceryListStatus,
  type MealPlanRead,
  type PantryRead,
} from "../lib/api"
import { showBrowserWarning, warnError } from "../lib/browserWarnings"
import { cn } from "../lib/utils"

const selectClass =
  "h-10 rounded-xl border border-border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

const categories: { id: GroceryItemCategory; label: string }[] = [
  { id: "produce", label: "Produce" },
  { id: "dairy", label: "Dairy" },
  { id: "meat", label: "Meat" },
  { id: "pantry", label: "Pantry" },
  { id: "frozen", label: "Frozen" },
  { id: "beverages", label: "Beverages" },
  { id: "household", label: "Household" },
  { id: "other", label: "Other" },
]

const statusLabels: Record<GroceryListStatus, string> = {
  draft: "Draft",
  shopping: "Shopping",
  ordered: "Ordered",
  archived: "Archived",
}

const itemStatusLabels: Record<GroceryItemStatus, string> = {
  needed: "Needed",
  in_cart: "In cart",
  purchased: "Purchased",
  skipped: "Skipped",
}

const itemStatusCycle: Record<GroceryItemStatus, GroceryItemStatus> = {
  needed: "in_cart",
  in_cart: "purchased",
  purchased: "needed",
  skipped: "needed",
}

interface ItemForm {
  name: string
  quantity: string
  unit: string
  category: GroceryItemCategory
}

function emptyItemForm(): ItemForm {
  return { name: "", quantity: "", unit: "", category: "other" }
}

export function GroceriesPage() {
  const [lists, setLists] = useState<GroceryList[]>([])
  const [selectedList, setSelectedList] = useState<GroceryList | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [showNewList, setShowNewList] = useState(false)
  const [newListTitle, setNewListTitle] = useState("")
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm())
  const [pantry, setPantry] = useState<PantryRead | null>(null)
  const [pantryOpen, setPantryOpen] = useState(false)
  const [mealPlan, setMealPlan] = useState<MealPlanRead | null>(null)
  const [receiptSyncAt, setReceiptSyncAt] = useState<string | null>(null)

  const selectedListId = selectedList?.id ?? null

  const loadPantry = useCallback(async () => {
    try {
      setPantry(await getPantry())
    } catch {
      setPantry(null)
    }
  }, [])

  const loadLists = useCallback(
    async (preferredId?: number | null) => {
      setIsLoading(true)
      try {
        const loaded = await listGroceryLists()
        setLists(loaded)
        const nextSelected =
          loaded.find((list) => list.id === preferredId) ??
          loaded.find((list) => list.id === selectedListId) ??
          loaded[0] ??
          null
        setSelectedList(nextSelected)
      } catch (err) {
        warnError(err, "Couldn't load grocery lists")
      } finally {
        setIsLoading(false)
      }
    },
    [selectedListId],
  )

  useEffect(() => {
    void loadLists()
    void loadPantry()
  }, [])

  async function refreshSelected(listId = selectedListId) {
    if (!listId) {
      await loadLists()
      return
    }
    const [updated, loaded] = await Promise.all([getGroceryList(listId), listGroceryLists()])
    setSelectedList(updated)
    setLists(loaded.map((list) => (list.id === updated.id ? updated : list)))
  }

  async function handleCreateList(e: FormEvent) {
    e.preventDefault()
    if (!newListTitle.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      const list = await createGroceryList({
        title: newListTitle.trim(),
        status: "draft",
        source: "manual",
      })
      setNewListTitle("")
      setShowNewList(false)
      await loadLists(list.id)
      setMessage("Grocery list created.")
    } catch (err) {
      warnError(err, "Couldn't create grocery list")
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteList(list: GroceryList) {
    if (!window.confirm(`Delete "${list.title}"? This can't be undone.`)) return
    setBusy(true)
    setMessage(null)
    try {
      await deleteGroceryList(list.id)
      await loadLists(selectedListId === list.id ? null : selectedListId)
      setMessage("Grocery list deleted.")
    } catch (err) {
      warnError(err, "Couldn't delete grocery list")
    } finally {
      setBusy(false)
    }
  }

  async function handleAddItem(e: FormEvent) {
    e.preventDefault()
    if (!selectedList || !itemForm.name.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      await addGroceryItem(selectedList.id, {
        name: itemForm.name.trim(),
        quantity: parseQuantity(itemForm.quantity),
        unit: itemForm.unit.trim() || null,
        category: itemForm.category,
        status: "needed",
      })
      setItemForm(emptyItemForm())
      await refreshSelected(selectedList.id)
    } catch (err) {
      warnError(err, "Couldn't add grocery item")
    } finally {
      setBusy(false)
    }
  }

  async function handleCycleItem(item: GroceryListItem) {
    if (!selectedList || isReadOnly(selectedList)) return
    try {
      await updateGroceryItem(selectedList.id, item.id, { status: itemStatusCycle[item.status] })
      await refreshSelected(selectedList.id)
    } catch (err) {
      warnError(err, "Couldn't update grocery item")
    }
  }

  async function handleDeleteItem(item: GroceryListItem) {
    if (!selectedList || isReadOnly(selectedList)) return
    try {
      await deleteGroceryItem(selectedList.id, item.id)
      await refreshSelected(selectedList.id)
    } catch (err) {
      warnError(err, "Couldn't delete grocery item")
    }
  }

  async function handleSuggestItems() {
    if (!selectedList) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await suggestGroceryItems(selectedList.id)
      setSelectedList(result.list)
      setLists((prev) => prev.map((list) => (list.id === result.list.id ? result.list : list)))
      setMessage(`Added ${result.added_count} suggested item${result.added_count === 1 ? "" : "s"}.`)
    } catch (err) {
      warnError(err, "Couldn't suggest grocery items")
    } finally {
      setBusy(false)
    }
  }

  async function handleOpenInstacart() {
    if (!selectedList) return
    setBusy(true)
    setMessage(null)
    try {
      const handoff = await getInstacartHandoff(selectedList.id)
      window.open(handoff.url, "_blank", "noopener,noreferrer")
      setMessage(
        handoff.item_names.length
          ? `Opened Instacart search for ${handoff.item_names.length} item${handoff.item_names.length === 1 ? "" : "s"}.`
          : "Opened Instacart. This list has no active items yet.",
      )
    } catch (err) {
      warnError(err, "Couldn't open Instacart handoff")
    } finally {
      setBusy(false)
    }
  }

  async function handleSyncReceipts() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await syncInstacartReceipts()
      setReceiptSyncAt(result.last_synced_at)
      await loadPantry()
      setMessage(
        `Synced ${result.new_order_count} new order${result.new_order_count === 1 ? "" : "s"} (${result.new_item_count} items).`,
      )
    } catch (err) {
      warnError(err, "Couldn't sync Instacart receipts")
    } finally {
      setBusy(false)
    }
  }

  async function handleGenerateMealPlan() {
    if ((pantry?.item_count ?? 0) === 0) {
      setMessage("Sync Instacart receipts first so I know what's in your kitchen.")
      return
    }

    setBusy(true)
    setMessage(null)
    try {
      const plan = await generateMealPlan()
      setMealPlan(plan)
      setMessage("Weekly meal plan generated from your pantry.")
    } catch (err) {
      showBrowserWarning(formatMealPlanError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleMealPlanToList() {
    if (!mealPlan) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await mealPlanToGroceryList(mealPlan)
      await loadLists(result.list.id)
      setMessage(`Added ${result.added_count} to-buy item${result.added_count === 1 ? "" : "s"} to a new grocery list.`)
    } catch (err) {
      warnError(err, "Couldn't create grocery list from meal plan")
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdateListStatus(status: GroceryListStatus) {
    if (!selectedList) return
    setBusy(true)
    setMessage(null)
    try {
      const updated = await updateGroceryList(selectedList.id, { status })
      setSelectedList(updated)
      setLists((prev) => prev.map((list) => (list.id === updated.id ? updated : list)))
      setMessage(`Marked list as ${statusLabels[status].toLowerCase()}.`)
    } catch (err) {
      warnError(err, "Couldn't update grocery list")
    } finally {
      setBusy(false)
    }
  }

  const groupedItems = useMemo(() => {
    const groups: Record<GroceryItemCategory, GroceryListItem[]> = {
      produce: [],
      dairy: [],
      meat: [],
      pantry: [],
      frozen: [],
      beverages: [],
      household: [],
      other: [],
    }
    for (const item of selectedList?.items ?? []) groups[item.category].push(item)
    for (const category of categories) {
      groups[category.id].sort((a, b) => statusSort(a.status) - statusSort(b.status))
    }
    return groups
  }, [selectedList])

  const pantryByCategory = useMemo(() => {
    const groups: Record<GroceryItemCategory, PantryRead["items"]> = {
      produce: [],
      dairy: [],
      meat: [],
      pantry: [],
      frozen: [],
      beverages: [],
      household: [],
      other: [],
    }
    for (const item of pantry?.items ?? []) groups[item.category].push(item)
    return groups
  }, [pantry])

  const readonly = selectedList ? isReadOnly(selectedList) : false

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Groceries</h1>
          <p className="text-sm text-muted-foreground">
            Sync Instacart receipts, see what is in your kitchen, and plan meals for the week.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handleSyncReceipts} disabled={busy}>
            <RefreshCw className={cn("mr-1.5 h-4 w-4", busy && "animate-spin")} />
            Sync receipts
          </Button>
          <Button type="button" variant="outline" onClick={handleGenerateMealPlan} disabled={busy}>
            <Sparkles className={cn("mr-1.5 h-4 w-4", busy && "animate-spin")} />
            Meal plan
          </Button>
          <Button onClick={() => setShowNewList((value) => !value)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {showNewList ? "Cancel" : "New list"}
          </Button>
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-success/20 bg-success/8 px-4 py-3 text-sm text-success">
          {message}
        </div>
      ) : null}

      <div className="fluid-card overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between px-5 py-4 text-left"
          onClick={() => setPantryOpen((open) => !open)}
        >
          <div>
            <p className="font-semibold">In my kitchen</p>
            <p className="text-xs text-muted-foreground">
              {pantry?.item_count ?? 0} item{pantry?.item_count === 1 ? "" : "s"} from recent Instacart orders
              {receiptSyncAt ? ` · synced ${new Date(receiptSyncAt).toLocaleString()}` : ""}
            </p>
          </div>
          {pantryOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {pantryOpen ? (
          <div className="border-t border-border/60 px-5 pb-5 pt-4">
            {pantry && pantry.items.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {categories.map((category) =>
                  pantryByCategory[category.id].length > 0 ? (
                    <div key={category.id}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {category.label}
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {pantryByCategory[category.id].slice(0, 8).map((item) => (
                          <li key={item.name} className="text-sm">
                            <span className="font-medium">{item.name}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {formatPantryQuantity(item)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No pantry items yet. Connect Gmail in Settings, then sync Instacart receipts.
              </p>
            )}
          </div>
        ) : null}
      </div>

      {mealPlan ? (
        <div className="fluid-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Weekly meal plan</h2>
              <p className="text-sm text-muted-foreground">
                Based on {mealPlan.pantry_item_count} pantry items · {new Date(mealPlan.start_at).toLocaleDateString()} –{" "}
                {new Date(mealPlan.end_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={handleMealPlanToList} disabled={busy}>
                Add to-buy items to list
              </Button>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            {mealPlan.days.map((day) => (
              <div key={day.date} className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-sm font-semibold">{day.label}</p>
                <div className="mt-2 space-y-3">
                  {day.meals.map((meal) => (
                    <div key={`${day.date}-${meal.title}`}>
                      <p className="text-sm font-medium">{meal.title}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {meal.ingredients.map((ingredient) => (
                          <span
                            key={`${meal.title}-${ingredient.name}`}
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              ingredient.on_hand
                                ? "bg-success/10 text-success"
                                : "bg-primary/10 text-primary",
                            )}
                          >
                            {ingredient.name}
                            {ingredient.on_hand ? " · on hand" : " · buy"}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showNewList ? (
        <form
          onSubmit={handleCreateList}
          className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm sm:flex-row"
        >
          <Input
            value={newListTitle}
            onChange={(event) => setNewListTitle(event.target.value)}
            placeholder="Week of groceries"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !newListTitle.trim()}>
            Create
          </Button>
        </form>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-3">
          <div className="rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Lists</h2>
              <Button type="button" variant="ghost" size="icon" onClick={() => void loadLists()} disabled={isLoading}>
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {isLoading ? (
                [0, 1, 2].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
                ))
              ) : lists.length > 0 ? (
                lists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => setSelectedList(list)}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-colors",
                      selectedList?.id === list.id
                        ? "border-primary/40 bg-primary/10"
                        : "border-border bg-muted/20 hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium">{list.title}</p>
                      <StatusPill status={list.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {list.items.length} item{list.items.length === 1 ? "" : "s"} ·{" "}
                      {new Date(list.created_at).toLocaleDateString()}
                    </p>
                  </button>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No grocery lists yet. Create one to start.
                </p>
              )}
            </div>
          </div>
        </aside>

        <section className="min-h-[480px] rounded-xl border border-border/80 bg-card/90 p-5 shadow-sm">
          {selectedList ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{selectedList.title}</h2>
                    <StatusPill status={selectedList.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {readonly
                      ? "This list is read-only because it has been ordered or archived."
                      : "Add items manually, ask AI for suggestions, or open an Instacart search."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleSuggestItems} disabled={busy || readonly}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Suggest items
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleOpenInstacart} disabled={busy}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open Instacart
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleUpdateListStatus("ordered")}
                    disabled={busy || selectedList.status === "ordered"}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Mark ordered
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleUpdateListStatus("archived")}
                    disabled={busy || selectedList.status === "archived"}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleDeleteList(selectedList)}
                    disabled={busy}
                  >
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </div>
              </div>

              {!readonly ? (
                <form onSubmit={handleAddItem} className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 md:grid-cols-[1fr_110px_100px_150px_auto]">
                  <Input
                    value={itemForm.name}
                    onChange={(event) => setItemForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Add item"
                    disabled={busy}
                  />
                  <Input
                    value={itemForm.quantity}
                    onChange={(event) => setItemForm((prev) => ({ ...prev, quantity: event.target.value }))}
                    placeholder="Qty"
                    type="number"
                    min={0}
                    step="0.1"
                    disabled={busy}
                  />
                  <Input
                    value={itemForm.unit}
                    onChange={(event) => setItemForm((prev) => ({ ...prev, unit: event.target.value }))}
                    placeholder="Unit"
                    disabled={busy}
                  />
                  <select
                    className={selectClass}
                    value={itemForm.category}
                    onChange={(event) =>
                      setItemForm((prev) => ({
                        ...prev,
                        category: event.target.value as GroceryItemCategory,
                      }))
                    }
                    disabled={busy}
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" disabled={busy || !itemForm.name.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </form>
              ) : null}

              {selectedList.items.length > 0 ? (
                <div className="space-y-5">
                  {categories.map((category) =>
                    groupedItems[category.id].length > 0 ? (
                      <div key={category.id}>
                        <h3 className="text-sm font-semibold text-muted-foreground">{category.label}</h3>
                        <div className="mt-2 space-y-2">
                          {groupedItems[category.id].map((item) => (
                            <GroceryItemRow
                              key={item.id}
                              item={item}
                              readonly={readonly}
                              onCycle={() => void handleCycleItem(item)}
                              onDelete={() => void handleDeleteItem(item)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-8 text-center">
                  <ShoppingCart className="mx-auto h-10 w-10 text-muted-foreground" />
                  <h3 className="mt-3 font-semibold">No items yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add an item manually or let Gemini suggest staples from your week.
                  </p>
                  {!readonly ? (
                    <Button className="mt-4" variant="outline" onClick={handleSuggestItems} disabled={busy}>
                      <Sparkles className="h-4 w-4" />
                      Suggest items
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-semibold">Create your first grocery list</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Grocery planning starts simple: a list, a few items, and an Instacart search handoff.
              </p>
              <Button className="mt-4" onClick={() => setShowNewList(true)}>
                New list
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

interface GroceryItemRowProps {
  item: GroceryListItem
  readonly: boolean
  onCycle: () => void
  onDelete: () => void
}

function GroceryItemRow({ item, readonly, onCycle, onDelete }: GroceryItemRowProps) {
  const checked = item.status === "in_cart" || item.status === "purchased"
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2",
        item.status === "purchased" && "opacity-70",
      )}
    >
      <button
        type="button"
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded border",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
          readonly && "cursor-not-allowed",
        )}
        onClick={onCycle}
        disabled={readonly}
        aria-label={`Mark ${item.name} as ${itemStatusLabels[itemStatusCycle[item.status]]}`}
      >
        {checked ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", item.status === "purchased" && "line-through")}>
          {item.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatQuantity(item)} · {itemStatusLabels[item.status]}
          {item.notes ? ` · ${item.notes}` : ""}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon" disabled={readonly} onClick={onDelete}>
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  )
}

function StatusPill({ status }: { status: GroceryListStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "ordered" && "bg-success/10 text-success",
        status === "shopping" && "bg-primary/10 text-primary",
        status === "archived" && "bg-muted text-muted-foreground",
        status === "draft" && "bg-warning/10 text-warning",
      )}
    >
      {statusLabels[status]}
    </span>
  )
}

function formatPantryQuantity(item: PantryRead["items"][number]) {
  if (item.quantity == null) return item.unit || "recent"
  return `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
}

function parseQuantity(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function formatQuantity(item: GroceryListItem) {
  if (item.quantity == null) return item.unit || "No quantity"
  return `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
}

function formatMealPlanError(err: unknown) {
  const fallback = "Couldn't generate meal plan"
  if (!(err instanceof Error)) return fallback

  const detail = err.message.toLowerCase()
  if (detail.includes("gemini") && detail.includes("429")) {
    return "The meal-plan AI is rate-limited right now. Try again in a minute."
  }
  return err.message || fallback
}

function isReadOnly(list: GroceryList) {
  return list.status === "ordered" || list.status === "archived"
}

function statusSort(status: GroceryItemStatus) {
  switch (status) {
    case "needed":
      return 0
    case "in_cart":
      return 1
    case "purchased":
      return 2
    case "skipped":
      return 3
  }
}
