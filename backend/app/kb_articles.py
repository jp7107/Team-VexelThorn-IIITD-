"""Disease KB articles (plan CNT-01): one per MVP disease class, each summarised from the cited extension page.

Every fact below comes from its source page as read on 2026-10-18. No pesticide names or doses on purpose:
the farmer is sent to the label and the local KVK for any spray decision (plan §10 dose rule).
"""

UMN = "University of Minnesota Extension"
UCIPM = "UC Statewide IPM Program (UC IPM)"
CPN = "Crop Protection Network"
SPRAY = ("Before using any spray, confirm the disease and the product with your local Krishi Vigyan Kendra "
         "or agriculture officer, and follow the label.")

EARLY_BLIGHT_URL = ("https://extension.umn.edu/agriculture/specialty-crops/vegetable-farming/disease-management/"
                    "early-blight-in-tomato-and-potato")
LATE_BLIGHT_URL = "https://extension.umn.edu/agriculture/specialty-crops/vegetable-farming/disease-management/late-blight"

EARLY_BLIGHT_BODY = (
    "Early blight starts on the lowest, oldest leaves: yellowing leaves with brown spots that show rings like a "
    "target. It also forms brown lesions on stems. "
    "What helps: use disease-free seed; rotate away from tomato, potato and related crops for at least two years; "
    "fertilise properly so plants stay vigorous; keep leaves dry with drip irrigation instead of overhead watering, "
    "and don't work among wet plants; stake and prune for airflow; mulch so soil can't splash onto leaves; pick off "
    "spotted leaves early (no more than one third of the plant) and dispose of them away from the field, washing "
    "hands and tools afterwards; remove or bury infected plants at the end of the season. " + SPRAY)

LATE_BLIGHT_BODY = (
    "Late blight is a fast, potentially devastating water mould disease of tomato and potato. Leaves get large dark "
    "brown blotches with a grey-green edge that are not limited by veins; stems get firm dark brown lesions. In "
    "humid weather a thin white growth appears on infected parts. Tomato fruit gets firm dark brown spots; potato "
    "tubers become discoloured, shrunken and soft. It favours cool (about 16-21 °C), damp weather; long hot, dry "
    "spells can stop it. "
    "What helps: keep leaves dry (drip irrigation, water in the morning, stake and space plants); scout early in the "
    "day, especially in shaded or poorly ventilated parts of the field; destroy cull piles and volunteer potato "
    "plants; plant certified potato seed and inspect tomato transplants; if only a few plants are infected, remove "
    "and destroy them at once; grow resistant varieties. Neighbouring fields are at risk, so tell your local "
    "agriculture officer quickly. " + SPRAY)

KB_ARTICLES = [
    {"disease_class_code": "tomato__early_blight", "crop_code": "tomato", "title": "Early blight of tomato",
     "body": EARLY_BLIGHT_BODY, "source_name": UMN, "source_url": EARLY_BLIGHT_URL},
    {"disease_class_code": "potato__early_blight", "crop_code": "potato", "title": "Early blight of potato",
     "body": EARLY_BLIGHT_BODY, "source_name": UMN, "source_url": EARLY_BLIGHT_URL},
    {"disease_class_code": "tomato__late_blight", "crop_code": "tomato", "title": "Late blight of tomato",
     "body": LATE_BLIGHT_BODY, "source_name": UMN, "source_url": LATE_BLIGHT_URL},
    {"disease_class_code": "potato__late_blight", "crop_code": "potato", "title": "Late blight of potato",
     "body": LATE_BLIGHT_BODY, "source_name": UMN, "source_url": LATE_BLIGHT_URL},
    {"disease_class_code": "tomato__septoria_leaf_spot", "crop_code": "tomato", "title": "Septoria leaf spot of tomato",
     "body": (
         "Small dark spots with white or light centres appear first on the lowest leaves. The fungus survives in soil "
         "and splashes up onto leaves; it needs wet leaves to infect, and new spots can spread it again within about "
         "two weeks. "
         "What helps: remove the lower third of the leaves and pick off spotted leaves early (never more than one "
         "third of the plant); mulch the soil under plants; water the soil, not the leaves; stake or trellis; don't "
         "work among wet plants; weed and space plants for airflow; don't save seed from infected plants; rotate so "
         "two years pass before tomato or pepper is grown in the same spot. " + SPRAY),
     "source_name": UMN,
     "source_url": ("https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/"
                    "yard-and-garden-problems/tomato-leaf-spot-diseases")},
    {"disease_class_code": "tomato__leaf_mold", "crop_code": "tomato", "title": "Leaf mould of tomato",
     "body": (
         "Pale yellow-green spots without clear edges appear on the upper side of the oldest leaves, with olive-green "
         "to brown velvety mould underneath. Spots merge and leaves wither but often stay attached. It is worst when "
         "relative humidity stays above 85%, which is common in greenhouses and tunnels. "
         "What helps: watch closely in humid spells; use drip irrigation and keep foliage dry; space, stake and prune "
         "plants for airflow; ventilate tunnels and greenhouses; sanitise stakes, ties and trellises; remove and burn "
         "or bury crop residue away from tomato areas after harvest. Resistant varieties exist but the fungus has many "
         "races, so try them on a small area first. " + SPRAY),
     "source_name": UMN,
     "source_url": ("https://extension.umn.edu/agriculture/specialty-crops/vegetable-farming/disease-management/"
                    "tomato-leaf-mold")},
    {"disease_class_code": "tomato__bacterial_spot", "crop_code": "tomato", "title": "Bacterial spot of tomato",
     "body": (
         "Water-soaked spots on older leaves turn dark brown to black and slightly raised (up to about 7 mm); larger "
         "blotches can form at leaf edges. On young fruit, sunken spots with a water-soaked halo become brown and "
         "scabby. The bacterium is carried in seed and on transplants, survives in crop debris, volunteer tomatoes and "
         "weeds like nightshade, and spreads by rain and sprinkler splash in warm (20 °C and above), humid weather. "
         "What helps: start with disease-free seed and transplants, the most important step; avoid sprinkler "
         "irrigation; keep cull piles away from nurseries and fields; rotate with a non-host crop. " + SPRAY),
     "source_name": UCIPM, "source_url": "https://ipm.ucanr.edu/agriculture/tomato/bacterial-spot"},
    {"disease_class_code": "tomato__target_spot", "crop_code": "tomato", "title": "Target spot of tomato",
     "body": (
         "Pinpoint dark brown spots on leaves grow into lesions with light brown to grey centres and dark rings, "
         "sometimes with yellowing around them; they can merge and strip leaves early. Stems and leaf stalks get oval "
         "dark brown lesions. On fruit, small sunken brown flecks become deep pits that can crack in an X or star "
         "shape and rot after harvest. Spores spread by wind and rain; warm (about 28-32 °C), humid weather and long "
         "periods of wet leaves favour it. "
         "What helps: rotate with crops outside the tomato family; start with clean, healthy transplants; remove "
         "weeds (especially nightshade-family weeds), volunteer plants and crop debris. " + SPRAY),
     "source_name": "University of Florida IFAS Extension (EDIS PP351)",
     "source_url": "https://ask.ifas.ufl.edu/publication/PP351"},
    {"disease_class_code": "tomato__spider_mites", "crop_code": "tomato", "title": "Spider mites on tomato",
     "body": (
         "Spider mites are tiny pests, not a disease. Leaves show fine light speckles, then turn bronze, yellow or "
         "reddish and drop; heavy infestations leave webbing. Outbreaks follow hot, dusty weather, water-stressed "
         "plants, and broad-spectrum insecticide sprays that kill the mites' natural enemies. "
         "What helps: water enough that plants are never drought-stressed; keep dust down with mulch and by wetting "
         "paths; spray water forcefully on the undersides of leaves regularly; protect predators such as predatory "
         "mites by avoiding unnecessary broad-spectrum sprays. " + SPRAY),
     "source_name": UCIPM, "source_url": "https://ipm.ucanr.edu/home-and-landscape/spider-mites/"},
    {"disease_class_code": "tomato__yellow_leaf_curl_virus", "crop_code": "tomato",
     "title": "Tomato yellow leaf curl virus",
     "body": (
         "Plants are stunted and upright with small leaves that curl upward, crumple and yellow between the veins and "
         "at the edges; short internodes make them bushy. Flowers drop, and yield can be lost completely when plants "
         "are infected young. Whiteflies spread the virus between plants; infected transplants carry it long "
         "distances. There is no cure for an infected plant. "
         "What helps: grow resistant varieties; use virus-free, whitefly-free transplants; don't plant new fields "
         "next to old infected ones; manage whiteflies, including fine-mesh covers on young plants; pull out "
         "infected plants while there are few; control weeds; destroy old crop residue and volunteers after "
         "harvest. " + SPRAY),
     "source_name": UCIPM, "source_url": "https://ipm.ucanr.edu/agriculture/tomato/tomato-yellow-leaf-curl"},
    {"disease_class_code": "tomato__mosaic_virus", "crop_code": "tomato", "title": "Tomato mosaic virus",
     "body": (
         "Leaves show a mild mosaic and can be malformed or fern-like; in cool weather they can become "
         "thin like shoestrings, and fruit can show dead patches. The virus spreads very easily on hands, tools and "
         "equipment when plants are handled, and through seed, infected plant debris and tobacco products. Insects "
         "do not spread it. There is no cure for an infected plant. "
         "What helps: use treated, virus-free seed; grow resistant varieties; keep strict hygiene: wash hands before handling "
         "plants (especially after using tobacco), clean tools, and remove infected plants and debris. " + SPRAY),
     "source_name": UCIPM, "source_url": "https://ipm.ucanr.edu/agriculture/tomato/tobacco-mosaic"},
    {"disease_class_code": "maize__common_rust", "crop_code": "maize", "title": "Common rust of maize",
     "body": (
         "Small yellow flecks become powdery brick-red pustules (about 3 mm, oval or long) scattered or clustered; they turn black "
         "as they age, and badly infected leaves can die. Husks, leaf sheaths and "
         "stalks can also be infected. Wind carries the spores long distances; high humidity, mild nights (about "
         "18-21 °C) and moderate days favour it. It is seldom serious in hybrid maize. "
         "What helps: grow resistant hybrids. " + SPRAY),
     "source_name": CPN, "source_url": "https://cropprotectionnetwork.org/encyclopedia/common-rust-of-corn"},
    {"disease_class_code": "maize__gray_leaf_spot", "crop_code": "maize", "title": "Grey leaf spot of maize",
     "body": (
         "Long (up to 5 cm), narrow, rectangular light tan lesions bounded by the leaf veins appear on lower leaves "
         "two to three weeks before tasselling, later turning grey and merging to kill whole leaves. The fungus "
         "survives in maize residue, so it is worse in maize after maize; spores spread by wind and splashing water. "
         "Warm (about 27-32 °C), very humid weather (above 90% for 12 hours or more) favours it. "
         "What helps: grow resistant hybrids; rotate crops; reduce surface residue through tillage. " + SPRAY),
     "source_name": CPN, "source_url": "https://cropprotectionnetwork.org/encyclopedia/gray-leaf-spot-of-corn"},
    {"disease_class_code": "maize__northern_leaf_blight", "crop_code": "maize",
     "title": "Northern leaf blight of maize (turcicum leaf blight)",
     "body": (
         "Long (2.5-15 cm), cigar-shaped lesions start grey-green on lower leaves and turn pale grey or tan; in moist "
         "weather dark grey spores make them look dirty. Severe cases kill whole leaves. The fungus survives in maize "
         "residue and spreads by wind and splashing water; long leaf wetness (over 6 hours) and moderate temperatures "
         "(about 18-27 °C) favour it. "
         "What helps: grow resistant hybrids where the disease is a risk; rotate crops; reduce surface residue "
         "through tillage. " + SPRAY),
     "source_name": CPN, "source_url": "https://cropprotectionnetwork.org/encyclopedia/northern-corn-leaf-blight-of-corn"},
]

# Productivity articles (plan CNT-01): one per MVP crop, from Tamil Nadu Agricultural University's TNAU Agritech
# Portal, read on 2026-10-18. Fertiliser rates are quoted from the source; pesticide and herbicide names are left out.
TNAU = "TNAU Agritech Portal (Tamil Nadu Agricultural University)"
LOCAL = ("These are TNAU's general recommendations; your local Krishi Vigyan Kendra can adjust varieties, dates and "
         "fertiliser for your soil and region.")

PRODUCTIVITY_ARTICLES = [
    {"crop_code": "tomato", "title": "Tomato: good practices for higher yield",
     "body": (
         "Soil: well-drained sandy loam rich in organic matter; strongly acidic soil does not suit tomato, so test "
         "the soil before the season. Seasons: plant in May-June or November-December. Seed: about 400 g per "
         "hectare (about 150 g for hybrids). Nursery: sow in lines 10 cm apart on raised beds, cover with sand, "
         "water with a rose can and transplant at 25 days. Spacing for hybrids: 60 cm between ridges and 45 cm "
         "between plants. Water on the third day after planting and then weekly. Manure and fertiliser: apply 25 t/ha "
         "farmyard manure, with 2 kg/ha each of Azospirillum and Phosphobacteria mixed in manure; for varieties, "
         "75 kg N, 100 kg P, 50 kg K, 10 kg borax and 50 kg zinc sulphate per hectare at planting and another 75 kg "
         "N/ha at 30 days during earthing up. Hand-weed at 30 days; black plastic mulch also controls weeds. For "
         "hybrids, stake plants at 30 days with 1-1.5 m stakes and remove side branches up to 20 cm from the ground. "
         "Harvest fruit as it turns red. TNAU reports average yields of 80-90 t/ha for its tomato hybrids COTH 1 and "
         "COTH 2. " + LOCAL),
     "source_name": TNAU, "source_url": "https://agritech.tnau.ac.in/govt_schemes_services/aas/tomato.html"},
    {"crop_code": "potato", "title": "Potato: good practices for higher yield",
     "body": (
         "Soil: friable, porous and well drained; potato prefers cool weather. In the plains, plant in "
         "October-November. Seed: about 3000-3500 kg of tubers per hectare; plant disease-free, well-sprouted tubers "
         "of 40-50 g, 20 cm apart on ridges 45 cm apart, and 10-15 cm deep (shallow planting invites tuber moth). "
         "Water 10 days after planting and then once a week. Manure and fertiliser: 15 t/ha farmyard manure with "
         "2 kg each of Azospirillum and Phosphobacteria, and 120 kg N, 240 kg P and 120 kg K per hectare, half at "
         "planting and half as top dressing at 30 days, plus 60 kg/ha magnesium sulphate at planting. Keep the field "
         "weed-free for the first 60 days: hoe at 45 days without disturbing the stolons, and hoe and earth up at "
         "60 days, which also protects tubers from tuber moth. Don't grow potato in the same field year after year; "
         "rotate with vegetables and green manure. Use virus-free seed and pull out virus-affected plants. Expected "
         "yield is 15-20 t/ha. " + LOCAL),
     "source_name": TNAU, "source_url": "https://agritech.tnau.ac.in/horticulture/horti_vegetables_potato.html"},
    {"crop_code": "maize", "title": "Irrigated maize: good practices for higher yield",
     "body": (
         "Field: plough once with a disc or mouldboard plough, then cross-plough to a fine tilth; form ridges and "
         "furrows 60 cm apart. Apply 12.5 t/ha farmyard manure or compost with 2 kg/ha Azospirillum before the last "
         "ploughing. Seed: 20 kg/ha for hybrids, sown 60 cm x 25 cm. Fertiliser: 250 kg N, 75 kg P2O5 and 75 kg K2O "
         "per hectare; a quarter of the N with all the P and K at sowing, half the N at 25 days and the last quarter "
         "at 45 days. Water: irrigate after sowing, on day 4 and day 12, then through the season (on heavy soils "
         "around days 25, 36, 48, 60, 72 and 85; light soils need more frequent water). Never let the crop run short "
         "of water from 45 to 65 days, the flowering stage. Hoe and hand-weed around day 30. Harvest when the husk "
         "turns yellow and the grain is hard and dry. " + LOCAL),
     "source_name": TNAU, "source_url": "https://agritech.tnau.ac.in/agriculture/agri_maize_irrigated_maize.html"},
]
