import { randomInt } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { DEMO_EMPLOYEE, demoVendorPin } from "../src/lib/demo";
import { demoMode } from "../src/lib/mode";
import { normalizeIndianMobile } from "../src/lib/phone";
import { hashPin } from "../src/lib/pin";

// Prisma only loads .env; read the same files the app does (.env.local etc.).
loadEnvConfig(process.cwd());

// Demo stalls share one known PIN. Outside demo mode each new stall gets its own
// random PIN, printed once below, unless DEMO_VENDOR_PIN is set explicitly.
function newStallPin() {
  if (demoMode() || process.env.DEMO_VENDOR_PIN) return demoVendorPin();
  return String(randomInt(100000, 1000000));
}
const issuedPins: { stall: string; pin: string }[] = [];

const prisma = new PrismaClient();

function issuedPin(stall: string) {
  const pin = newStallPin();
  issuedPins.push({ stall, pin });
  return pin;
}

type ItemSeed = {
  slug: string;
  name: string;
  description: string;
  priceInr: number;
  veg: boolean;
  category: string;
  available?: boolean;
};

type StallSeed = {
  id: string;
  name: string;
  cuisine: string;
  description: string;
  location: string;
  openTime: string;
  closeTime: string;
  vegOnly: boolean;
  busyLevel: "quiet" | "moderate" | "busy";
  accent: string;
  items: ItemSeed[];
};

const stalls: StallSeed[] = [
  {
    id: "dosa",
    name: "Dosa Counter",
    cuisine: "South Indian",
    description: "Crisp dosas off the tawa, chutney and sambar on the side.",
    location: "Food Court · Wing A",
    openTime: "07:30",
    closeTime: "22:00",
    vegOnly: true,
    busyLevel: "busy",
    accent: "#0f766e",
    items: [
      { slug: "masala", name: "Masala dosa", description: "Potato masala, coconut chutney, sambar.", priceInr: 90, veg: true, category: "Dosa" },
      { slug: "mysore", name: "Mysore masala dosa", description: "Red chutney smear, extra crisp.", priceInr: 110, veg: true, category: "Dosa" },
      { slug: "onion", name: "Onion rava dosa", description: "Lacy rava batter with onion and chilli.", priceInr: 100, veg: true, category: "Dosa" },
      { slug: "cheese", name: "Cheese dosa", description: "Processed cheese, gunpowder, butter.", priceInr: 120, veg: true, category: "Dosa" },
      { slug: "vada", name: "Medu vada (2 pcs)", description: "Crisp vadas with sambar.", priceInr: 70, veg: true, category: "Sides" },
      { slug: "filter", name: "Filter coffee", description: "Decoction with hot milk, steel tumbler.", priceInr: 35, veg: true, category: "Drinks" },
      { slug: "buttermilk", name: "Spiced buttermilk", description: "Chaas with ginger and curry leaf.", priceInr: 30, veg: true, category: "Drinks" },
    ],
  },
  {
    id: "biryani",
    name: "Hyderabadi Biryani House",
    cuisine: "Biryani",
    description: "Dum biryani by the box. Skip the 40-minute counter wait.",
    location: "Food Court · Wing A",
    openTime: "12:00",
    closeTime: "15:00",
    vegOnly: false,
    busyLevel: "busy",
    accent: "#b45309",
    items: [
      { slug: "chicken", name: "Chicken dum biryani", description: "Single, with mirchi ka salan and raita.", priceInr: 180, veg: false, category: "Biryani" },
      { slug: "mutton", name: "Mutton dum biryani", description: "Slow-cooked mutton, extra masala.", priceInr: 240, veg: false, category: "Biryani" },
      { slug: "veg", name: "Veg dum biryani", description: "Paneer, beans, and fried onion.", priceInr: 150, veg: true, category: "Biryani" },
      { slug: "egg", name: "Egg biryani", description: "Two boiled eggs, dum rice.", priceInr: 140, veg: false, category: "Biryani" },
      { slug: "salan", name: "Mirchi ka salan extra", description: "Side of peanut chilli gravy.", priceInr: 30, veg: true, category: "Sides" },
      { slug: "raita", name: "Burani raita", description: "Garlic yogurt raita.", priceInr: 35, veg: true, category: "Sides" },
      { slug: "shorba", name: "Mutton shorba", description: "Clear pepper broth.", priceInr: 60, veg: false, category: "Sides" },
    ],
  },
  {
    id: "punjab",
    name: "Punjab Grill Express",
    cuisine: "North Indian",
    description: "Roti, dal, and a quick thali for the 1pm rush.",
    location: "Food Court · Wing B",
    openTime: "11:30",
    closeTime: "22:30",
    vegOnly: false,
    busyLevel: "moderate",
    accent: "#c2410c",
    items: [
      { slug: "thali-veg", name: "Veg thali", description: "Dal, seasonal sabzi, raita, two rotis, salad.", priceInr: 140, veg: true, category: "Thali" },
      { slug: "thali-chicken", name: "Chicken thali", description: "Butter chicken, dal, two rotis, salad.", priceInr: 190, veg: false, category: "Thali" },
      { slug: "dal-makhani", name: "Dal makhani + 3 roti", description: "Overnight dal with tawa rotis.", priceInr: 130, veg: true, category: "Combos" },
      { slug: "paneer", name: "Paneer butter masala", description: "Half portion, gravy only.", priceInr: 120, veg: true, category: "Mains" },
      { slug: "chicken-tikka", name: "Chicken tikka (6 pcs)", description: "Tandoor tikka, mint chutney.", priceInr: 180, veg: false, category: "Tandoor" },
      { slug: "lassi", name: "Sweet lassi", description: "Punjabi lassi, chilled.", priceInr: 50, veg: true, category: "Drinks" },
      { slug: "jeera-rice", name: "Jeera rice", description: "Cumin tempered basmati.", priceInr: 60, veg: true, category: "Sides" },
    ],
  },
  {
    id: "china",
    name: "Mainland China Bowl",
    cuisine: "Indo-Chinese",
    description: "Hakka, manchurian, and fried rice in takeaway boxes.",
    location: "Food Court · Wing B",
    openTime: "11:30",
    closeTime: "22:30",
    vegOnly: false,
    busyLevel: "busy",
    accent: "#b91c1c",
    items: [
      { slug: "veg-fried", name: "Veg fried rice", description: "Wok rice with mixed veg.", priceInr: 110, veg: true, category: "Rice" },
      { slug: "chicken-fried", name: "Chicken fried rice", description: "Egg and chicken fried rice.", priceInr: 140, veg: false, category: "Rice" },
      { slug: "hakka", name: "Veg hakka noodles", description: "Tossed with chilli and garlic.", priceInr: 120, veg: true, category: "Noodles" },
      { slug: "manchurian", name: "Gobi manchurian dry", description: "Crisp cauliflower, spicy glaze.", priceInr: 130, veg: true, category: "Sides" },
      { slug: "chilli-chicken", name: "Chilli chicken dry", description: "Boneless, Indo-Chinese heat.", priceInr: 170, veg: false, category: "Sides" },
      { slug: "soup", name: "Sweet corn soup", description: "Veg sweet corn, mild.", priceInr: 70, veg: true, category: "Soup" },
      { slug: "combo", name: "Rice + manchurian combo", description: "Half fried rice, half gobi manchurian.", priceInr: 160, veg: true, category: "Combos" },
    ],
  },
  {
    id: "rolls",
    name: "Roll Nation",
    cuisine: "Kathi rolls",
    description: "Kolkata-style kathi rolls, wrapped and ready.",
    location: "Food Court · Wing A",
    openTime: "11:30",
    closeTime: "23:00",
    vegOnly: false,
    busyLevel: "moderate",
    accent: "#7c2d12",
    items: [
      { slug: "egg", name: "Egg roll", description: "Single egg, onion, chilli, lime.", priceInr: 80, veg: false, category: "Rolls" },
      { slug: "chicken", name: "Chicken kathi roll", description: "Tikka, egg wash, onion.", priceInr: 130, veg: false, category: "Rolls" },
      { slug: "paneer", name: "Paneer roll", description: "Spiced paneer, mint, onion.", priceInr: 110, veg: true, category: "Rolls" },
      { slug: "double-egg", name: "Double egg chicken roll", description: "Heavier wrap for a late lunch.", priceInr: 150, veg: false, category: "Rolls" },
      { slug: "aloo", name: "Aloo masala roll", description: "Potato filling, green chutney.", priceInr: 70, veg: true, category: "Rolls" },
      { slug: "cheese-chicken", name: "Cheese chicken roll", description: "Melted cheese over tikka.", priceInr: 160, veg: false, category: "Rolls" },
    ],
  },
  {
    id: "sandwich",
    name: "Sandwich & Wrap Lab",
    cuisine: "Cafe",
    description: "Toasted sandwiches and wraps, 24x7 for desk lunches and night shifts.",
    location: "Annex corridor",
    openTime: "00:00",
    closeTime: "23:59",
    vegOnly: false,
    busyLevel: "quiet",
    accent: "#365314",
    items: [
      { slug: "club", name: "Veg club sandwich", description: "Triple deck, fries on the side.", priceInr: 120, veg: true, category: "Sandwiches" },
      { slug: "grilled-chicken", name: "Grilled chicken sandwich", description: "Mustard mayo, lettuce, tomato.", priceInr: 140, veg: false, category: "Sandwiches" },
      { slug: "paneer-wrap", name: "Tandoori paneer wrap", description: "Whole wheat wrap, yogurt dip.", priceInr: 130, veg: true, category: "Wraps" },
      { slug: "falafel", name: "Falafel wrap", description: "Chickpea patties, hummus, pickle.", priceInr: 130, veg: true, category: "Wraps" },
      { slug: "colespaw", name: "Coleslaw sandwich", description: "Light, toasted white bread.", priceInr: 80, veg: true, category: "Sandwiches" },
      { slug: "cold-coffee", name: "Cold coffee", description: "Blended, no sugar-free option.", priceInr: 70, veg: true, category: "Drinks" },
      { slug: "fries", name: "Masala fries", description: "Chaat masala dusting.", priceInr: 60, veg: true, category: "Sides" },
    ],
  },
  {
    id: "tandoor",
    name: "Tandoor Express",
    cuisine: "Tandoor",
    description: "Skewers and naan from a shared tandoor.",
    location: "Food Court · Wing B",
    openTime: "12:00",
    closeTime: "23:00",
    vegOnly: false,
    busyLevel: "moderate",
    accent: "#9a3412",
    items: [
      { slug: "naan", name: "Butter naan (2)", description: "Fresh from the tandoor.", priceInr: 50, veg: true, category: "Breads" },
      { slug: "garlic-naan", name: "Garlic naan (2)", description: "Garlic butter, coriander.", priceInr: 70, veg: true, category: "Breads" },
      { slug: "paneer-tikka", name: "Paneer tikka (6 pcs)", description: "Hung curd marinade.", priceInr: 160, veg: true, category: "Tandoor" },
      { slug: "malai-chicken", name: "Malai chicken tikka", description: "Creamy, mild heat.", priceInr: 190, veg: false, category: "Tandoor" },
      { slug: "seekh", name: "Mutton seekh kebab (4)", description: "Minced kebab, mint.", priceInr: 200, veg: false, category: "Tandoor" },
      { slug: "kulcha", name: "Amritsari kulcha + chole", description: "Stuffed kulcha with chole.", priceInr: 130, veg: true, category: "Combos" },
    ],
  },
  {
    id: "sambar",
    name: "Sambar House",
    cuisine: "Meals",
    description: "Unlimited-feel meals in a limited box. Rice, sambar, poriyal.",
    location: "Food Court · Wing A",
    openTime: "11:30",
    closeTime: "15:00",
    vegOnly: true,
    busyLevel: "busy",
    accent: "#166534",
    items: [
      { slug: "meals", name: "South Indian meals", description: "Rice, sambar, rasam, poriyal, curd, pickle, appalam.", priceInr: 110, veg: true, category: "Meals" },
      { slug: "curd-rice", name: "Curd rice", description: "Tempered curd rice, pickle.", priceInr: 70, veg: true, category: "Meals" },
      { slug: "lemon-rice", name: "Lemon rice + poriyal", description: "Light, packing-friendly.", priceInr: 80, veg: true, category: "Meals" },
      { slug: "bisi", name: "Bisi bele bath", description: "Lentil rice, khara boondi.", priceInr: 90, veg: true, category: "Meals" },
      { slug: "rasam", name: "Pepper rasam", description: "Cup of rasam.", priceInr: 30, veg: true, category: "Drinks" },
      { slug: "payasam", name: "Semiya payasam", description: "Small cup, dessert.", priceInr: 40, veg: true, category: "Dessert" },
    ],
  },
  {
    id: "chaat",
    name: "Chaat Street",
    cuisine: "Chaat",
    description: "Pani puri, sev puri, and a quick snack if lunch was light.",
    location: "Ground floor plaza",
    openTime: "11:30",
    closeTime: "22:00",
    vegOnly: true,
    busyLevel: "moderate",
    accent: "#a16207",
    items: [
      { slug: "pani", name: "Pani puri (8 pcs)", description: "Teekha and meetha pani.", priceInr: 60, veg: true, category: "Chaat" },
      { slug: "sev", name: "Sev puri", description: "Crisp puris, sev, chutneys.", priceInr: 70, veg: true, category: "Chaat" },
      { slug: "bhel", name: "Bhel puri", description: "Mumbai bhel, extra sev.", priceInr: 70, veg: true, category: "Chaat" },
      { slug: "dahi", name: "Dahi papdi chaat", description: "Yogurt, sweet chutney, masala.", priceInr: 80, veg: true, category: "Chaat" },
      { slug: "samosa", name: "Samosa chaat", description: "Crushed samosa, chole, dahi.", priceInr: 90, veg: true, category: "Chaat" },
      { slug: "jaljeera", name: "Jaljeera", description: "Chilled, masala lime.", priceInr: 30, veg: true, category: "Drinks" },
    ],
  },
  {
    id: "shawarma",
    name: "Grill & Shawarma",
    cuisine: "Grill",
    description: "Shawarma rolls and grilled chicken plates.",
    location: "Food Court · Wing B",
    openTime: "12:00",
    closeTime: "23:00",
    vegOnly: false,
    busyLevel: "busy",
    accent: "#854d0e",
    items: [
      { slug: "chicken-shawarma", name: "Chicken shawarma roll", description: "Garlic sauce, pickle, fries inside.", priceInr: 140, veg: false, category: "Shawarma" },
      { slug: "plate", name: "Shawarma plate", description: "Sliced chicken, hummus, pita, salad.", priceInr: 190, veg: false, category: "Plates" },
      { slug: "falafel-plate", name: "Falafel plate", description: "Falafel, hummus, pita.", priceInr: 160, veg: true, category: "Plates" },
      { slug: "grill-chicken", name: "Grilled chicken half", description: "Charcoal grill, garlic dip.", priceInr: 220, veg: false, category: "Grill" },
      { slug: "hummus", name: "Hummus + pita", description: "Snack plate.", priceInr: 90, veg: true, category: "Sides" },
      { slug: "mint-lime", name: "Mint lime soda", description: "Fresh mint, soda.", priceInr: 50, veg: true, category: "Drinks" },
    ],
  },
  {
    id: "pasta",
    name: "Pasta & Panini",
    cuisine: "Italian",
    description: "One-pot pastas and pressed paninis.",
    location: "Annex corridor",
    openTime: "11:30",
    closeTime: "22:00",
    vegOnly: false,
    busyLevel: "quiet",
    accent: "#1d4ed8",
    items: [
      { slug: "arrabbiata", name: "Penne arrabbiata", description: "Spicy tomato, basil.", priceInr: 140, veg: true, category: "Pasta" },
      { slug: "alfredo", name: "Fettuccine alfredo", description: "Cream sauce, veg or chicken add-on.", priceInr: 160, veg: true, category: "Pasta" },
      { slug: "chicken-pasta", name: "Chicken pesto pasta", description: "Basil pesto, grilled chicken.", priceInr: 190, veg: false, category: "Pasta" },
      { slug: "panini-veg", name: "Caprese panini", description: "Tomato, mozzarella, pesto.", priceInr: 130, veg: true, category: "Panini" },
      { slug: "panini-chicken", name: "Chicken pesto panini", description: "Pressed, with chips.", priceInr: 160, veg: false, category: "Panini" },
      { slug: "soup-bread", name: "Tomato soup + garlic bread", description: "Light combo.", priceInr: 90, veg: true, category: "Combos" },
    ],
  },
  {
    id: "salad",
    name: "Salad Bar Co.",
    cuisine: "Healthy",
    description: "Build-your-own bowls without hovering over the salad counter.",
    location: "Ground floor plaza",
    openTime: "11:30",
    closeTime: "15:30",
    vegOnly: false,
    busyLevel: "quiet",
    accent: "#15803d",
    items: [
      { slug: "garden", name: "Garden bowl", description: "Greens, cucumber, tomato, vinaigrette.", priceInr: 110, veg: true, category: "Bowls" },
      { slug: "quinoa", name: "Quinoa chickpea bowl", description: "Quinoa, roast veg, tahini.", priceInr: 150, veg: true, category: "Bowls" },
      { slug: "chicken-bowl", name: "Grilled chicken salad", description: "Chicken, greens, honey mustard.", priceInr: 170, veg: false, category: "Bowls" },
      { slug: "greek", name: "Greek salad", description: "Feta, olives, cucumber.", priceInr: 140, veg: true, category: "Bowls" },
      { slug: "fruit", name: "Cut fruit cup", description: "Seasonal fruit.", priceInr: 70, veg: true, category: "Sides" },
      { slug: "yogurt", name: "Greek yogurt parfait", description: "Honey, granola.", priceInr: 90, veg: true, category: "Dessert" },
      { slug: "smoothie", name: "Green smoothie", description: "Spinach, banana, apple.", priceInr: 90, veg: true, category: "Drinks" },
    ],
  },
  {
    id: "burger",
    name: "Burger Junction",
    cuisine: "Burgers",
    description: "Smash burgers and loaded fries. No 15-person grill queue.",
    location: "Food Court · Wing B",
    openTime: "11:30",
    closeTime: "23:30",
    vegOnly: false,
    busyLevel: "moderate",
    accent: "#b45309",
    items: [
      { slug: "aloo", name: "Aloo tikki burger", description: "Classic, with chutney.", priceInr: 80, veg: true, category: "Burgers" },
      { slug: "veggie", name: "Crispy veggie burger", description: "Patty, cheese, mayo.", priceInr: 110, veg: true, category: "Burgers" },
      { slug: "chicken", name: "Fried chicken burger", description: "Spicy mayo, pickle.", priceInr: 150, veg: false, category: "Burgers" },
      { slug: "double", name: "Double chicken burger", description: "Two patties, cheese.", priceInr: 190, veg: false, category: "Burgers" },
      { slug: "fries", name: "Loaded fries", description: "Cheese sauce, jalapeño.", priceInr: 90, veg: true, category: "Sides" },
      { slug: "shake", name: "Chocolate shake", description: "Thick shake.", priceInr: 90, veg: true, category: "Drinks" },
    ],
  },
  {
    id: "idli",
    name: "Idli & Filter Coffee",
    cuisine: "Tiffin",
    description: "24x7 tiffin counter. Soft idlis and filter coffee for the night shift too.",
    location: "Food Court · Wing A",
    openTime: "00:00",
    closeTime: "23:59",
    vegOnly: true,
    busyLevel: "moderate",
    accent: "#0f766e",
    items: [
      { slug: "idli", name: "Idli (3 pcs)", description: "With sambar and chutney.", priceInr: 50, veg: true, category: "Tiffin" },
      { slug: "ghee-idli", name: "Ghee podi idli", description: "Gunpowder and ghee.", priceInr: 70, veg: true, category: "Tiffin" },
      { slug: "vada-combo", name: "Idli vada combo", description: "Two idli, one vada.", priceInr: 70, veg: true, category: "Tiffin" },
      { slug: "pongal", name: "Ven pongal", description: "With ghee, sambar, chutney.", priceInr: 80, veg: true, category: "Tiffin" },
      { slug: "kesari", name: "Kesari bath", description: "Small plate.", priceInr: 40, veg: true, category: "Dessert" },
      { slug: "coffee", name: "Filter coffee", description: "Byriani-strong decoction.", priceInr: 35, veg: true, category: "Drinks" },
      { slug: "tea", name: "Ginger tea", description: "Cutting chai style, full cup.", priceInr: 20, veg: true, category: "Drinks" },
    ],
  },
  {
    id: "momos",
    name: "Maggi & Momos",
    cuisine: "Street",
    description: "Steamed momos and masala maggi, open round the clock.",
    location: "Ground floor plaza",
    openTime: "00:00",
    closeTime: "23:59",
    vegOnly: false,
    busyLevel: "quiet",
    accent: "#c2410c",
    items: [
      { slug: "veg-steam", name: "Veg steamed momos (8)", description: "With spicy chutney.", priceInr: 80, veg: true, category: "Momos" },
      { slug: "chicken-steam", name: "Chicken steamed momos (8)", description: "Minced chicken filling.", priceInr: 100, veg: false, category: "Momos" },
      { slug: "kurkure", name: "Kurkure momos (8)", description: "Fried, crunchy coating.", priceInr: 110, veg: true, category: "Momos" },
      { slug: "maggi", name: "Masala maggi", description: "Veg maggi, extra chilli.", priceInr: 60, veg: true, category: "Maggi" },
      { slug: "cheese-maggi", name: "Cheese maggi", description: "Processed cheese melt.", priceInr: 80, veg: true, category: "Maggi" },
      { slug: "chicken-maggi", name: "Chicken maggi", description: "Shredded chicken tossed in.", priceInr: 90, veg: false, category: "Maggi" },
    ],
  },
  {
    id: "juice",
    name: "Fresh Juice & Smoothie",
    cuisine: "Beverages",
    description: "Juices, shakes, and tender coconut after a heavy thali.",
    location: "Ground floor plaza",
    openTime: "08:00",
    closeTime: "22:00",
    vegOnly: true,
    busyLevel: "quiet",
    accent: "#65a30d",
    items: [
      { slug: "mosambi", name: "Mosambi juice", description: "Fresh pressed.", priceInr: 50, veg: true, category: "Juice" },
      { slug: "watermelon", name: "Watermelon juice", description: "No ice filler.", priceInr: 50, veg: true, category: "Juice" },
      { slug: "mixed", name: "Mixed fruit juice", description: "Seasonal mix.", priceInr: 70, veg: true, category: "Juice" },
      { slug: "mango", name: "Mango smoothie", description: "Alphonso pulp when in season.", priceInr: 90, veg: true, category: "Smoothie" },
      { slug: "protein", name: "Peanut banana smoothie", description: "Filling, slightly sweet.", priceInr: 90, veg: true, category: "Smoothie" },
      { slug: "coconut", name: "Tender coconut", description: "Whole, straw in.", priceInr: 60, veg: true, category: "Juice" },
      { slug: "lime", name: "Fresh lime soda", description: "Sweet, salt, or mixed.", priceInr: 40, veg: true, category: "Drinks" },
    ],
  },
  {
    id: "sweets",
    name: "Sweet Spot",
    cuisine: "Dessert",
    description: "Gulab jamun, ice cream, and a small mithai box.",
    location: "Food Court · Wing A",
    openTime: "11:30",
    closeTime: "22:30",
    vegOnly: true,
    busyLevel: "quiet",
    accent: "#9d174d",
    items: [
      { slug: "jamun", name: "Gulab jamun (2 pcs)", description: "Warm, with syrup.", priceInr: 40, veg: true, category: "Mithai" },
      { slug: "rasmalai", name: "Rasmalai (2 pcs)", description: "Chilled.", priceInr: 60, veg: true, category: "Mithai" },
      { slug: "brownie", name: "Walnut brownie", description: "With chocolate sauce.", priceInr: 80, veg: true, category: "Bakery" },
      { slug: "icecream", name: "Vanilla ice cream cup", description: "Two scoops.", priceInr: 50, veg: true, category: "Ice cream" },
      { slug: "sundae", name: "Hot chocolate sundae", description: "Brownie, ice cream, sauce.", priceInr: 110, veg: true, category: "Ice cream" },
      { slug: "mithai-box", name: "Mixed mithai box", description: "Four pieces, take-away.", priceInr: 90, veg: true, category: "Mithai" },
    ],
  },
  {
    id: "jain",
    name: "Jain Kitchen",
    cuisine: "Jain",
    description: "No onion, no garlic. Clearly marked Jain thalis and snacks.",
    location: "Food Court · Wing A",
    openTime: "11:30",
    closeTime: "15:30",
    vegOnly: true,
    busyLevel: "moderate",
    accent: "#ca8a04",
    items: [
      { slug: "thali", name: "Jain thali", description: "Dal, sabzi, roti, rice, salad — Jain.", priceInr: 150, veg: true, category: "Thali" },
      { slug: "khichdi", name: "Jain khichdi", description: "Moong khichdi, kadhi.", priceInr: 110, veg: true, category: "Meals" },
      { slug: "pulao", name: "Veg pulao Jain", description: "No onion, peas pulao.", priceInr: 100, veg: true, category: "Meals" },
      { slug: "paratha", name: "Aloo paratha Jain (2)", description: "With curd and pickle.", priceInr: 90, veg: true, category: "Breads" },
      { slug: "fafda", name: "Fafda jalebi plate", description: "Gujarati snack plate.", priceInr: 80, veg: true, category: "Snacks" },
      { slug: "chaas", name: "Jain chaas", description: "No tadka onion.", priceInr: 30, veg: true, category: "Drinks" },
    ],
  },
  {
    id: "andhra",
    name: "Andhra Meals",
    cuisine: "Andhra",
    description: "Gongura, natu kodi, and meals that actually sting.",
    location: "Food Court · Wing B",
    openTime: "11:30",
    closeTime: "15:00",
    vegOnly: false,
    busyLevel: "busy",
    accent: "#b91c1c",
    items: [
      { slug: "veg-meals", name: "Andhra veg meals", description: "Rice, pappu, fry, pulusu, curd, pickle, appadam.", priceInr: 130, veg: true, category: "Meals" },
      { slug: "chicken-meals", name: "Andhra chicken meals", description: "Chicken curry with the veg meals spread.", priceInr: 190, veg: false, category: "Meals" },
      { slug: "gongura", name: "Gongura chicken", description: "Half portion, extra spicy.", priceInr: 160, veg: false, category: "Mains" },
      { slug: "natu", name: "Natu kodi iguru", description: "Country chicken, limited stock.", priceInr: 220, veg: false, category: "Mains", available: false },
      { slug: "pappu", name: "Tomato pappu + rice", description: "Comfort dal rice.", priceInr: 90, veg: true, category: "Meals" },
      { slug: "pulusu", name: "Bendakaya pulusu", description: "Okra tamarind gravy.", priceInr: 80, veg: true, category: "Mains" },
      { slug: "buttermilk", name: "Majjiga", description: "Andhra buttermilk.", priceInr: 25, veg: true, category: "Drinks" },
    ],
  },
  {
    id: "bbq",
    name: "BBQ Rice Bowl",
    cuisine: "Bowls",
    description: "Rice bowls with grilled toppings. Fast to plate, easy to carry.",
    location: "Annex corridor",
    openTime: "11:30",
    closeTime: "15:30",
    vegOnly: false,
    busyLevel: "moderate",
    accent: "#7c2d12",
    items: [
      { slug: "paneer-bowl", name: "BBQ paneer bowl", description: "Rice, grilled paneer, slaw, sauce.", priceInr: 150, veg: true, category: "Bowls" },
      { slug: "chicken-bowl", name: "BBQ chicken bowl", description: "Charred chicken, corn, rice.", priceInr: 170, veg: false, category: "Bowls" },
      { slug: "egg-bowl", name: "Chilli garlic egg bowl", description: "Two eggs, garlic rice.", priceInr: 130, veg: false, category: "Bowls" },
      { slug: "mushroom", name: "Smoky mushroom bowl", description: "Roast mushroom, sesame.", priceInr: 150, veg: true, category: "Bowls" },
      { slug: "extra-chicken", name: "Extra grilled chicken", description: "Add-on protein.", priceInr: 70, veg: false, category: "Add-ons" },
      { slug: "corn", name: "Butter corn cup", description: "Side of corn.", priceInr: 50, veg: true, category: "Sides" },
    ],
  },
];

// Seeding only fills in what is missing. Once a stall exists, its hours, PIN and
// menu belong to the vendor and are never overwritten by a reseed.
async function main() {
  let createdStalls = 0;
  let createdItems = 0;
  for (const stall of stalls) {
    const existing = await prisma.stall.findUnique({ where: { id: stall.id }, select: { id: true } });
    if (!existing) {
      await prisma.stall.create({
        data: {
          id: stall.id,
          name: stall.name,
          cuisine: stall.cuisine,
          description: stall.description,
          location: stall.location,
          openTime: stall.openTime,
          closeTime: stall.closeTime,
          vegOnly: stall.vegOnly,
          busyLevel: stall.busyLevel,
          vendorPinHash: hashPin(issuedPin(stall.name)),
          accent: stall.accent,
        },
      });
      createdStalls += 1;
    }

    for (const item of stall.items) {
      const id = `${stall.id}-${item.slug}`;
      const found = await prisma.menuItem.findUnique({ where: { id }, select: { id: true } });
      if (found) continue;
      await prisma.menuItem.create({
        data: {
          id,
          stallId: stall.id,
          name: item.name,
          description: item.description,
          priceInr: item.priceInr,
          veg: item.veg,
          category: item.category,
          available: item.available ?? true,
        },
      });
      createdItems += 1;
    }
  }

  const demoPhone = normalizeIndianMobile(DEMO_EMPLOYEE.phone)!;
  const demoExists = await prisma.employee.findFirst({
    where: { OR: [{ phone: demoPhone }, { employeeId: DEMO_EMPLOYEE.employeeId }] },
    select: { id: true },
  });
  const addDemo = demoMode() && !demoExists;
  if (addDemo) {
    await prisma.employee.create({
      data: {
        employeeId: DEMO_EMPLOYEE.employeeId,
        name: DEMO_EMPLOYEE.name,
        phone: demoPhone,
        pinHash: hashPin(DEMO_EMPLOYEE.pin),
      },
    });
  }

  console.log(
    `Seed complete: ${stalls.length} stalls known, ${createdStalls} created, ${createdItems} menu items added` +
      `${addDemo ? ", demo employee added" : ""}.`,
  );
  if (demoExists && !demoMode()) {
    console.warn(`Warning: demo employee ${DEMO_EMPLOYEE.employeeId} exists but DEMO_MODE is off. Delete it before real use.`);
  }
  if (issuedPins.length && !demoMode() && !process.env.DEMO_VENDOR_PIN) {
    console.log("Counter PINs for new stalls (shown once; vendors can change them under Menu):");
    for (const { stall, pin } of issuedPins) console.log(`  ${stall.padEnd(28)} ${pin}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
