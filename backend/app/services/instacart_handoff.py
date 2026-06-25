from urllib.parse import urlencode

from app.models.grocery import GroceryItemStatus, GroceryList
from app.schemas.grocery import InstacartHandoff


INSTACART_HOME = "https://www.instacart.com/"
INSTACART_SEARCH = "https://www.instacart.com/store/s"
MAX_QUERY_LENGTH = 200


def build_handoff(grocery_list: GroceryList) -> InstacartHandoff:
    item_names = [
        item.name
        for item in grocery_list.items
        if item.status in {GroceryItemStatus.needed, GroceryItemStatus.in_cart}
    ]
    query = " ".join(item_names).strip()[:MAX_QUERY_LENGTH].strip()
    if not query:
        return InstacartHandoff(url=INSTACART_HOME, query="", item_names=[])

    url = f"{INSTACART_SEARCH}?{urlencode({'k': query})}"
    return InstacartHandoff(url=url, query=query, item_names=item_names)
