COBRO IMS — INVENTORY DATA IMPORT TEMPLATES
=============================================

These two spreadsheets are how Cobro's real stock data gets into the
system. Fill them in, send them back to X Spark, and we load them —
there's no need to type each item into the app by hand.

IMPORTANT: as of this build, loading a completed file into the live
system is still a manual step X Spark does on your behalf — the
in-app "upload and import" screen itself hasn't been built yet. These
templates exist so you can start capturing your real inventory data in
the correct shape right away, ahead of that screen being ready.

--------------------------------------------------------------------
FILE 1: product-import-template.csv
--------------------------------------------------------------------
One row per item you stock — the master list of everything in Stores
(spares, consumables, tools, materials). This is the "what is it"
list. It does NOT include quantities — that's the second file.

Columns:

  sku                Required. A short, unique code you use to
                      identify the item — e.g. BRG-6205-2RS. No two
                      rows may share a SKU.
  name                Required. The plain-language item name, e.g.
                      "Bearing 6205 2RS".
  description         Optional. Extra detail — size, spec, grade.
  unit_of_measure     Required. How it's counted/issued — e.g. ea
                      (each), box, tub, m, kg, L.
  barcode             Optional. The number printed under an existing
                      supplier barcode, if the item already has one.
                      Leave blank for items you don't have a barcode
                      for yet — the system can print its own QR
                      labels for those once loaded.
  reorder_point       Optional. When on-hand stock drops to or below
                      this number, the item shows as "low stock" on
                      the dashboard. Leave blank if you don't want an
                      alert for that item.
  reorder_quantity    Optional. How much you'd typically reorder at
                      once. Informational only for now.

  packaging_uom       Optional. The unit the item is purchased/stored
                      in — e.g. box, bag, pack, pallet, drum, roll,
                      carton. Set this when your stock arrives in
                      containers that hold multiple individual units
                      (e.g. a box of 100 bolts). Leave blank for items
                      that aren't packaged.
  qty_per_package     Required when packaging_uom is set. How many
                      individual units are in one package (e.g. 100 if
                      one box holds 100 bolts). Must be a positive
                      number. Leave blank when packaging_uom is blank.
  default_unit_cost   Optional. The cost of ONE individual unit (e.g.
                      R0.50 per bolt, NOT R50 per box). This is the
                      starting costing reference — actual weighted-
                      average cost is recalculated from real receipts.
                      Leave blank to set pricing manually in the app.

The 12 rows already in the file are examples, not Cobro's real items —
generic MRO spares (bearings, filters, grease, welding rods, PPE, etc.)
showing the format and how much detail to fill in per column,
including what an optional column looks like left blank (see
FLT-OIL-STD's blank description, or most rows' blank barcode). Delete
all 12 and replace with your real items — don't leave any example rows
mixed in with the real data you send back.

If a value itself contains a comma (e.g. a description like "Rubber,
full-face"), wrap that whole value in double quotes so it isn't read
as two separate columns — Excel/Google Sheets do this for you
automatically when you save as CSV, so you only need to worry about it
if you're editing the raw file directly in a text editor.

--------------------------------------------------------------------
FILE 2: opening-stock-import-template.csv
--------------------------------------------------------------------
One row per (item, location, quantity) — how much of each item you
currently hold, and where. This is what actually "hydrates" the
system with real stock levels once loaded, rather than an empty
catalogue.

Columns:

  sku                 Required. Must match a sku from the product
                       file exactly.
  warehouse_code       Required. Which store/warehouse holds this
                       stock. Ask X Spark for your confirmed location
                       codes before filling this in — the demo system
                       currently uses DBN-FAC / PMB-WH / RBB-DEP as
                       placeholders, which will be replaced with
                       Cobro's real store/location codes.
  quantity_on_hand     Required (unless quantity_in_packages is used
                       instead). How many individual units you
                       currently hold at that location — e.g. 800 for
                       800 individual bolts. Do not convert to
                       packages; always express in the item's base
                       unit (ea, kg, m, etc.). Supply EITHER this
                       column OR quantity_in_packages, not both.
  quantity_in_packages Optional convenience column for packaged items.
                       If the product has packaging configured (a
                       packaging_uom and qty_per_package in the
                       product file), you can give the quantity as a
                       number of packages here and the system will
                       convert to individual units automatically.
                       e.g. enter 8 here for 8 boxes of hose clamps
                       (100/box = 800 individual clamps). Leave blank
                       when using quantity_on_hand, and vice versa.
                       If the product has no packaging configured,
                       this column is rejected — use quantity_on_hand
                       instead.
There is no unit_cost column here — the Product Catalogue is the only
place an item's cost is ever set (its unit_price or default_unit_cost
in the product file, or the Price column in the app once it's
loaded). Opening stock is costed from whichever of those the item
already has, so set a price or default unit cost for every item
BEFORE importing its opening stock — a row for an item with neither
is rejected rather than guessed at.

If the same item is held at more than one location, give it one row
per location.

The 12 example rows here use the same SKUs as the product file's
examples, spread across all three demo warehouse codes — showing that
every sku here must exist in the product file, and that one item can
appear more than once if it's held in more than one place. Delete all
12 and replace with your real stock counts.

--------------------------------------------------------------------
A FEW RULES THAT WILL MAKE THIS GO SMOOTHLY
--------------------------------------------------------------------
- Every sku must be unique in the product file, and every sku used in
  the opening-stock file must exist in the product file.
- Don't leave a "Required" column blank.
- Quantities and prices must be plain numbers (e.g. 40 or 85.00) — no
  currency symbols, no commas as thousand-separators.
- If you're not sure about a value, leave optional columns blank
  rather than guessing — we can always add detail later, but wrong
  data is harder to spot and fix once it's loaded.
- Keep these as plain CSV (comma-separated) files — if you edit them
  in Excel, use "Save As → CSV" rather than saving as .xlsx.
- Remove every example row before sending your completed file back —
  they're there to show the format only, not to be imported as real
  stock.

Questions about any of this — ask X Spark before filling in a large
batch, so we can confirm the format matches what the import expects.
