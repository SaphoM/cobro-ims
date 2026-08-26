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

The three example rows in the file are just that — examples, showing
the format. Delete them and replace with your real items.

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
  quantity_on_hand     Required. How many/much you currently have on
                       hand at that location, right now.
  unit_cost            Required. What that stock is worth per unit —
                       your best current cost estimate is fine if you
                       don't have exact purchase records. This becomes
                       the item's starting cost in the system; every
                       purchase after that recalculates it
                       automatically (weighted-average costing).

If the same item is held at more than one location, give it one row
per location.

--------------------------------------------------------------------
A FEW RULES THAT WILL MAKE THIS GO SMOOTHLY
--------------------------------------------------------------------
- Every sku must be unique in the product file, and every sku used in
  the opening-stock file must exist in the product file.
- Don't leave a "Required" column blank.
- Quantities and costs must be plain numbers (e.g. 40 or 85.00) — no
  currency symbols, no commas as thousand-separators.
- If you're not sure about a value, leave optional columns blank
  rather than guessing — we can always add detail later, but wrong
  data is harder to spot and fix once it's loaded.
- Keep these as plain CSV (comma-separated) files — if you edit them
  in Excel, use "Save As → CSV" rather than saving as .xlsx.

Questions about any of this — ask X Spark before filling in a large
batch, so we can confirm the format matches what the import expects.
