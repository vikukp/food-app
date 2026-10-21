export const CATALOGUE_OK: Record<string, string> = {
  added: "Item added to your menu.",
  saved: "Item saved.",
  soldout: "Marked sold out. Employees see it greyed out until you bring it back.",
  available: "Back on sale.",
  hidden: "Item hidden from the menu. Past orders keep it.",
  restored: "Item is visible on the menu again.",
  pin: "Counter PIN changed. Use the new PIN next time you sign in.",
  hours: "Counter hours saved. Pickup slots follow them right away.",
  capacity: "Saved. Checkout offers slots and wait times based on these numbers.",
  paused: "New orders paused. Orders already placed stay in your queue.",
  resumed: "Taking orders again.",
};

export const CATALOGUE_ERRORS: Record<string, string> = {
  invalid: "Give the item a name and a category (at least 2 characters each).",
  diet: "Pick veg, egg or non-veg for the item.",
  kcal: "Calories must be a whole number from 1 to 3000, or left empty.",
  price: "Price must be a whole number between ₹1 and ₹5,000.",
  offer: "Offer price must be a whole number lower than the regular price.",
  notfound: "That item is not on your menu.",
  full: "This menu already has 80 items. Hide a few before adding more.",
  rate: "Too many changes in a short time. Wait a minute and try again.",
  pin: "Current PIN is incorrect.",
  pinformat: "New PIN must be 4 to 8 digits.",
  pinmatch: "New PIN and confirmation do not match.",
  hours: "Enter opening and closing times like 11:30 and 15:00. They cannot be the same.",
  capacity: "Orders per slot must be 1 to 100, and prep time 2 to 90 minutes.",
};
