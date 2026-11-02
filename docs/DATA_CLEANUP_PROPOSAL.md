# Data cleanup proposal — awaiting approval

**Status: AWAITING USER APPROVAL — nothing has been deleted.** Generated from a read-only audit of the development database on 2026-11-01 and re-verified record by record on 2026-11-02 (`npm run cleanup:leftovers -w server -- --verbose`, dry run). A fresh backup was taken on 2026-11-02 (`backups/`).

## What is genuine and will not be touched

| Record | Evidence | Action |
|---|---|---|
| `admin@dhaaga.local` (admin) | Created by the seed from `ADMIN_EMAIL` | Keep |
| Supplier "SupplierCloth" (owner's email withheld here), Pending Review | Real email, registered through the site, not a test pattern | Keep (awaiting your review in the admin portal) |
| 112 categories | Taxonomy seed | Keep |
| The notification "SupplierCloth registered and is awaiting review" | Points at an existing supplier | Keep |

## Proposed removal (needs your approval)

Leftovers from earlier automated browser tests. The test accounts themselves were already removed by `npm run e2e:cleanup`, but that script did not yet clear the side effects below (it does now, for future runs).

| # | Records | Count | Evidence |
|---|---|---|---|
| 1 | Admin notifications "… submitted their application" / "Listing to review" | 31 | Link to supplier IDs that no longer exist, or name `E2E …` / `Probe …` test businesses |
| 1 | Fixture-supplier notifications "New bulk order request" | 6 | Reference test orders (`DB261101-…`) that no longer exist |
| 2 | Audit-log entries | 100 | About users, suppliers, products, documents and orders that no longer exist (all were automated-test records: 60 `user.registered`, 14 `supplier.approved`, 2 `supplier.submitted`, 13 `product.approved`, 2 `document.accepted`, 9 `order.created`) |

Command once approved: `npm run cleanup:leftovers -w server -- --apply` (deletes exactly items 1 and 2; take a backup first with `npm run db:backup`).

## Separate decision: development fixtures

| Record | Count | Status today |
|---|---|---|
| `[DEV FIXTURE] Test Supplier A` / `B` (`fixture-supplier-*@dev.invalid`) | 2 suppliers | Labelled `isFixture`, excluded from all admin statistics |
| `[DEV FIXTURE] Test …` products | 6 products, no photos | Hidden from the public marketplace unless `ENABLE_DEV_FIXTURES=true`; can never show when `NODE_ENV=production` |

They are isolated, not mixed with real data, and useful for local testing of cart/MOQ rules. Options: keep them (recommended for development), or remove them with `npm run seed:dev-fixtures -w server -- --remove`.

## Code audit — sources of fake data

| Source | Finding |
|---|---|
| Database seed (`server/prisma/seed.ts`) | Categories and an optional admin from environment variables only. No suppliers, products, orders, reviews or ratings. |
| Development fixtures (`server/prisma/dev-fixtures.ts`) | Clearly labelled, flagged `isFixture`, refuse to run in production, hidden by default. |
| Frontend | No hardcoded product listings, prices, ratings, reviews, testimonials, sales counts or "trusted by" claims. Dashboard numbers come from the API. Category photos are labelled illustrative. |
| API | No mock responses. Admin statistics exclude fixtures; "genuine orders" excludes orders that only involve fixture suppliers. |
| Automated tests | Server tests run in a throwaway `dhaaga_test_run_<timestamp>` database that is dropped afterwards. Browser tests use `e2e-*` emails and are removed by `npm run e2e:cleanup` (now including their notifications and audit entries). |
## Verification (2026-11-02)

- Every notification below either links to a supplier ID that no longer exists, names an automated-test business (`E2E …`, `Probe …`, or the pre-timestamp test name `Kumar Silk Weavers`), or refers to an order number that no longer exists.
- None mentions SupplierCloth or its owner's email; the one genuine notification ("SupplierCloth registered and is awaiting review") is excluded.
- No other table references notifications or audit-log rows, so removing them cannot break any record. The only effect is that the history of actions on already-deleted test accounts disappears; the audit history of every existing account is untouched.
- No genuine transaction is involved: the database contains 0 orders; the orders referenced were test orders already removed by `npm run e2e:cleanup`.

## Appendix A — notifications proposed for removal (37)

| ID | Created | Recipient | Type | Text | Link |
|---|---|---|---|---|---|
| cmvww2axm001143h4vjnmbi9j | 2026-10-31T21:03:55.355Z | fixture-supplier-a@dev.invalid | ORDER_REQUEST | Order DB261101-D380D6 is awaiting your confirmation. | /supplier/orders/cmvww2awv000v43h4sxme1deg |
| cmvww2axt001343h48bphin7w | 2026-10-31T21:03:55.361Z | fixture-supplier-b@dev.invalid | ORDER_REQUEST | Order DB261101-D380D6 is awaiting your confirmation. | /supplier/orders/cmvww2awv000y43h40rthdpws |
| cmvww8afg000743skequbl5in | 2026-10-31T21:08:34.636Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | Kumar Silk Weavers submitted their application. | /admin/suppliers/cmvww88wl000143sknsjtd6q1 |
| cmvwwcvlp000743w4uj8wg7fv | 2026-10-31T21:12:08.702Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | Kumar Silk Weavers submitted their application. | /admin/suppliers/cmvwwcu57000143w4g6yupzkj |
| cmvwwd1cm000l43w4h066hhf4 | 2026-10-31T21:12:16.150Z | admin@dhaaga.local | PRODUCT_SUBMITTED | Kumar Silk Weavers: E2E Banarasi Silk Saree 1793481123858 | /admin/products?status=PENDING_REVIEW |
| cmvwws1cb0011434k4l8sk4d4 | 2026-10-31T21:23:55.979Z | fixture-supplier-a@dev.invalid | ORDER_REQUEST | Order DB261101-40DB85 is awaiting your confirmation. | /supplier/orders/cmvwws1bq000v434k3qkxkpy2 |
| cmvwws1ce0013434k68lgolir | 2026-10-31T21:23:55.982Z | fixture-supplier-b@dev.invalid | ORDER_REQUEST | Order DB261101-40DB85 is awaiting your confirmation. | /supplier/orders/cmvwws1bq000y434kigjbtflp |
| cmvxiov4m000343pgswn5dhpg | 2026-11-01T07:37:19.510Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Silk Weavers 1793518633301 registered and is awaiting review. | /admin/suppliers/cmvxiov47000143pgmqa6cvsq |
| cmvxip1tg000d43pgj8xhllrm | 2026-11-01T07:37:28.180Z | admin@dhaaga.local | PRODUCT_SUBMITTED | E2E Kumar Silk Weavers 1793518633301: E2E Banarasi Silk Saree 1793518633301 | /admin/products?status=PENDING_REVIEW |
| cmvxiqj3o002443pgowem8sjx | 2026-11-01T07:38:37.236Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Silk Weavers 1793518711449 registered and is awaiting review. | /admin/suppliers/cmvxiqj3c002243pgb1hkqs14 |
| cmvxiqpl7002e43pgnipcdx69 | 2026-11-01T07:38:45.644Z | admin@dhaaga.local | PRODUCT_SUBMITTED | E2E Kumar Silk Weavers 1793518711449: E2E Banarasi Silk Saree 1793518711449 | /admin/products?status=PENDING_REVIEW |
| cmvxiulp7004j43pgp2udpbne | 2026-11-01T07:41:47.228Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Silk Weavers 1793518901608 registered and is awaiting review. | /admin/suppliers/cmvxiulox004h43pgy4tfign5 |
| cmvxius9v004t43pg6oiegnna | 2026-11-01T07:41:55.747Z | admin@dhaaga.local | PRODUCT_SUBMITTED | E2E Kumar Silk Weavers 1793518901608: E2E Banarasi Silk Saree 1793518901608 | /admin/products?status=PENDING_REVIEW |
| cmvxixzbh007g43pgyshew4ep | 2026-11-01T07:44:24.845Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Silk Weavers 1793519058880 registered and is awaiting review. | /admin/suppliers/cmvxixzb4007e43pgghyy0w7f |
| cmvxiy5xl007q43pgwh6dlztc | 2026-11-01T07:44:33.417Z | admin@dhaaga.local | PRODUCT_SUBMITTED | E2E Kumar Silk Weavers 1793519058880: E2E Banarasi Silk Saree 1793519058880 | /admin/products?status=PENDING_REVIEW |
| cmvxj0lf20003439w5dasbw5k | 2026-11-01T07:46:26.798Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Silk Weavers 1793519180182 registered and is awaiting review. | /admin/suppliers/cmvxj0lek0001439wvabep8yq |
| cmvxj0ry3000d439wa090dlqz | 2026-11-01T07:46:35.259Z | admin@dhaaga.local | PRODUCT_SUBMITTED | E2E Kumar Silk Weavers 1793519180182: E2E Banarasi Silk Saree 1793519180182 | /admin/products?status=PENDING_REVIEW |
| cmvxj5t31000343v4o2v5ezsk | 2026-11-01T07:50:30.013Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Silk Weavers 1793519423781 registered and is awaiting review. | /admin/suppliers/cmvxj5t2k000143v4w5n2gnns |
| cmvxj5zuk000d43v4e9t3kez9 | 2026-11-01T07:50:38.780Z | admin@dhaaga.local | PRODUCT_SUBMITTED | E2E Kumar Silk Weavers 1793519423781: E2E Banarasi Silk Saree 1793519423781 | /admin/products?status=PENDING_REVIEW |
| cmvxj79vl000y43v4al7ybjw4 | 2026-11-01T07:51:38.434Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Silk Weavers 1793519492563 registered and is awaiting review. | /admin/suppliers/cmvxj79v6000w43v4snr0bhz9 |
| cmvxj7gjq001843v4y7dktosq | 2026-11-01T07:51:47.079Z | admin@dhaaga.local | PRODUCT_SUBMITTED | E2E Kumar Silk Weavers 1793519492563: E2E Banarasi Silk Saree 1793519492563 | /admin/products?status=PENDING_REVIEW |
| cmvxjekhl002b43v4wjjvoiw9 | 2026-11-01T07:57:18.777Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Silk Weavers 1793519832936 registered and is awaiting review. | /admin/suppliers/cmvxjekh7002943v4izn1aoou |
| cmvxjeqyp002l43v4wr3d2fpn | 2026-11-01T07:57:27.169Z | admin@dhaaga.local | PRODUCT_SUBMITTED | E2E Kumar Silk Weavers 1793519832936: E2E Banarasi Silk Saree 1793519832936 | /admin/products?status=PENDING_REVIEW |
| cmvxjxx5b006o43v40kdxgrpe | 2026-11-01T08:12:21.647Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Silk Weavers 1793520735865 registered and is awaiting review. | /admin/suppliers/cmvxjxx4a006m43v4jm6vb7tk |
| cmvxjy3mi006y43v464lktlhp | 2026-11-01T08:12:30.042Z | admin@dhaaga.local | PRODUCT_SUBMITTED | E2E Kumar Silk Weavers 1793520735865: E2E Banarasi Silk Saree 1793520735865 | /admin/products?status=PENDING_REVIEW |
| cmvxk28o6001043jsmvs123rq | 2026-11-01T08:15:43.206Z | fixture-supplier-a@dev.invalid | ORDER_REQUEST | Order DB261101-66C2A99D is awaiting your confirmation. | /supplier/orders/cmvxk28nm000u43js34bfjj51 |
| cmvxk28oa001243js3he4b9iy | 2026-11-01T08:15:43.211Z | fixture-supplier-b@dev.invalid | ORDER_REQUEST | Order DB261101-66C2A99D is awaiting your confirmation. | /supplier/orders/cmvxk28nm000x43jsdvnchuwz |
| cmvxkvldk000343hs4cg0k62v | 2026-11-01T08:38:32.696Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | Probe Weavers registered and is awaiting review. | /admin/suppliers/cmvxkvlde000143hsdv5b2b7q |
| cmvxl284n000q43hspzgf5j5d | 2026-11-01T08:43:42.119Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Weavers 1793522610187 registered and is awaiting review. | /admin/suppliers/cmvxl284g000o43hsbjihbyl0 |
| cmvxl58ls000w43hsk963om9d | 2026-11-01T08:46:02.705Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Silk Weavers 1793522759615 registered and is awaiting review. | /admin/suppliers/cmvxl58ll000u43hsdg6orvln |
| cmvxl5d6d001643hs8kb0fudb | 2026-11-01T08:46:08.630Z | admin@dhaaga.local | PRODUCT_SUBMITTED | E2E Kumar Silk Weavers 1793522759615: E2E Banarasi Silk Saree 1793522759615 | /admin/products?status=PENDING_REVIEW |
| cmvxl81wl005743hszysy640p | 2026-11-01T08:48:13.989Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Weavers 1793522882477 registered and is awaiting review. | /admin/suppliers/cmvxl81wh005543hsu0zch4uu |
| cmvxl6i8t001r43hs6lkq1l1h | 2026-11-01T08:47:01.853Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Silk Weavers 1793522818965 registered and is awaiting review. | /admin/suppliers/cmvxl6i8m001p43hsmi75ck8i |
| cmvxl6ms9002143hs2qnvsqzj | 2026-11-01T08:47:07.738Z | admin@dhaaga.local | PRODUCT_SUBMITTED | E2E Kumar Silk Weavers 1793522818965: E2E Banarasi Silk Saree 1793522818965 | /admin/products?status=PENDING_REVIEW |
| cmvxt22oq006943hsjokymno2 | 2026-11-01T12:27:31.994Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Weavers 1793536034724 registered and is awaiting review. | /admin/suppliers/cmvxt22oj006743hshuoqaaii |
| cmvxt2id7006f43hsyzn4omzk | 2026-11-01T12:27:52.315Z | admin@dhaaga.local | SUPPLIER_SUBMITTED | E2E Kumar Silk Weavers 1793536069104 registered and is awaiting review. | /admin/suppliers/cmvxt2icx006d43hs9s9ldl21 |
| cmvxt2muj006p43hsq26pxl3f | 2026-11-01T12:27:58.123Z | admin@dhaaga.local | PRODUCT_SUBMITTED | E2E Kumar Silk Weavers 1793536069104: E2E Banarasi Silk Saree 1793536069104 | /admin/products?status=PENDING_REVIEW |

## Appendix B — audit-log entries proposed for removal (100)

| ID | Created | Action | Entity (no longer exists) |
|---|---|---|---|
| cmvww270s000343h48k327h08 | 2026-10-31T21:03:50.284Z | user.registered | User cmvww270g000043h4z7mil680 |
| cmvww56kq001d43h4aq1xc46x | 2026-10-31T21:06:09.674Z | user.registered | User cmvww56ki001a43h4h1n86qr6 |
| cmvww88wv000343skltiu65vw | 2026-10-31T21:08:32.672Z | user.registered | User cmvww88wl000043skf2d168mo |
| cmvwwcu5k000343w4qdid1v55 | 2026-10-31T21:12:06.824Z | user.registered | User cmvwwcu56000043w4t9flskor |
| cmvwwrxh00003434k0haaxa7t | 2026-10-31T21:23:50.964Z | user.registered | User cmvwwrxgm0000434kqxuh00l7 |
| cmvxiov4t000543pg4k85ewqw | 2026-11-01T07:37:19.517Z | user.registered | User cmvxiov46000043pgakadk02w |
| cmvxipf26000q43pg7veugxwd | 2026-11-01T07:37:45.342Z | user.registered | User cmvxipf1o000m43pguu5vxqvo |
| cmvxiqj3r002643pgn5jnj8rh | 2026-11-01T07:38:37.239Z | user.registered | User cmvxiqj3c002143pg1cvtdcud |
| cmvxir2r1002r43pga8xsu40r | 2026-11-01T07:39:02.701Z | user.registered | User cmvxir2qr002n43pg9tavpnrm |
| cmvxiulp9004l43pgw1qs7kd9 | 2026-11-01T07:41:47.230Z | user.registered | User cmvxiulow004g43pgksxkba94 |
| cmvxiv5l0005643pgoa5vsdjg | 2026-11-01T07:42:12.997Z | user.registered | User cmvxiv5kp005243pgs23mdzz3 |
| cmvxiyj31008343pg6l2ok3hl | 2026-11-01T07:44:50.461Z | user.registered | User cmvxiyj2r007z43pg0wm7dp5d |
| cmvxixzbk007i43pgbbnbdqv7 | 2026-11-01T07:44:24.848Z | user.registered | User cmvxixzb4007d43pg4e7hxszo |
| cmvxj0lf70005439wwd2ay7pq | 2026-11-01T07:46:26.803Z | user.registered | User cmvxj0lej0000439w1p822dsh |
| cmvxj153b000q439wbspmby3u | 2026-11-01T07:46:52.296Z | user.registered | User cmvxj1533000m439wovbx4yk7 |
| cmvxj5t35000543v4hsd7xape | 2026-11-01T07:50:30.018Z | user.registered | User cmvxj5t2k000043v47mxgx4sq |
| cmvxj6dii000q43v47oi4kb4a | 2026-11-01T07:50:56.490Z | user.registered | User cmvxj6di5000m43v4kyegaznd |
| cmvxj79vo001043v4xcbkkaji | 2026-11-01T07:51:38.437Z | user.registered | User cmvxj79v6000v43v41qw64qwk |
| cmvxj7u1m001l43v4la5jnwpk | 2026-11-01T07:52:04.571Z | user.registered | User cmvxj7u1b001h43v4pv52l4pq |
| cmvxjavv1001u43v4r48fb3x6 | 2026-11-01T07:54:26.894Z | user.registered | User cmvxjavut001q43v4kd9ax8ih |
| cmvxjbz5e002343v4l8mnshno | 2026-11-01T07:55:17.810Z | user.registered | User cmvxjbz57001z43v4fcfqaeqn |
| cmvxjekhp002d43v4o99gmux0 | 2026-11-01T07:57:18.781Z | user.registered | User cmvxjekh7002843v4zd7espzg |
| cmvxjf42y002y43v453g142t7 | 2026-11-01T07:57:44.171Z | user.registered | User cmvxjf42o002u43v4r85aaifr |
| cmvxjpyf6005743v45d1awzlj | 2026-11-01T08:06:10.050Z | user.registered | User cmvxjpyeu005343v4s6eki951 |
| cmvxjsfvf000443041lipyzz3 | 2026-11-01T08:08:05.979Z | user.registered | User cmvxjsfv000004304e7hv6bao |
| cmvxjsi9h000d4304lsowprxp | 2026-11-01T08:08:09.077Z | user.registered | User cmvxjsi960009430429s8kazk |
| cmvxjsmje005g43v43g8a04c6 | 2026-11-01T08:08:14.618Z | user.registered | User cmvxjsmj0005c43v4lkkknlyy |
| cmvxjsp2u005p43v4lro0tn4q | 2026-11-01T08:08:17.911Z | user.registered | User cmvxjsp2h005l43v49xvrwewm |
| cmvxjtpl8000m43040xtja21s | 2026-11-01T08:09:05.229Z | user.registered | User cmvxjtpkx000i4304ewkgabtc |
| cmvxjvr3y000v4304wxampxai | 2026-11-01T08:10:40.511Z | user.registered | User cmvxjvr3k000r4304lt2483d6 |
| cmvxjvvvp005y43v4j45jddve | 2026-11-01T08:10:46.693Z | user.registered | User cmvxjvvva005u43v4ift9fhxj |
| cmvxjwps600144304xfe6pmuk | 2026-11-01T08:11:25.447Z | user.registered | User cmvxjwpry00104304zdyptk0z |
| cmvxjwsig001d4304fv5csnvr | 2026-11-01T08:11:28.985Z | user.registered | User cmvxjwsi400194304qvbtnjnh |
| cmvxjwwzw006743v45e9gjyk5 | 2026-11-01T08:11:34.796Z | user.registered | User cmvxjwwzh006343v4r9e29frp |
| cmvxjwzuk006g43v44pwvvewv | 2026-11-01T08:11:38.492Z | user.registered | User cmvxjwzue006c43v4t7n2l2aq |
| cmvxjgqo0003743v4ems36fpv | 2026-11-01T07:59:00.096Z | user.registered | User cmvxjgqnm003343v4ukz31dbd |
| cmvxjhr65003g43v4gnlsjtb2 | 2026-11-01T07:59:47.405Z | user.registered | User cmvxjhr5t003c43v48y6vilfj |
| cmvxjinon003n43v4kr81nk16 | 2026-11-01T08:00:29.543Z | user.registered | User cmvxjinoh003j43v4xat40erv |
| cmvxjkefg003w43v4mr5ru2zk | 2026-11-01T08:01:50.860Z | user.registered | User cmvxjkef2003s43v4u69xtnh9 |
| cmvxjkh9d004543v48z4w0zlb | 2026-11-01T08:01:54.529Z | user.registered | User cmvxjkh90004143v4gb0fxlwc |
| cmvxjkmcs004e43v47eqvxde4 | 2026-11-01T08:02:01.132Z | user.registered | User cmvxjkmck004a43v4foziez5r |
| cmvxjkq5x004p43v48zjib2cv | 2026-11-01T08:02:06.070Z | user.registered | User cmvxjkq5p004l43v4tg4zcwb9 |
| cmvxjogi4004y43v418j1qi4b | 2026-11-01T08:05:00.173Z | user.registered | User cmvxjoghr004u43v40biqmi41 |
| cmvxjxx5e006q43v41liljju7 | 2026-11-01T08:12:21.650Z | user.registered | User cmvxjxx49006l43v4mc1fyd4c |
| cmvxjyh0u007b43v49ylqmxxd | 2026-11-01T08:12:47.406Z | user.registered | User cmvxjyh0n007743v40h6zdn6l |
| cmvxk25c8000443jscupx6gup | 2026-11-01T08:15:38.889Z | user.registered | User cmvxk25bv000043jsglpion8r |
| cmvxkvldl000543hs4l0ixucz | 2026-11-01T08:38:32.698Z | user.registered | User cmvxkvlde000043hsb4vnj6zv |
| cmvxl284p000s43hse7yfg6n0 | 2026-11-01T08:43:42.121Z | user.registered | User cmvxl284g000n43hs0xs101ru |
| cmvxl2414000a43hs984dx4uz | 2026-11-01T08:43:36.808Z | user.registered | User cmvxl240z000643hs1h62l337 |
| cmvxl58lu000y43hswtj4wjdq | 2026-11-01T08:46:02.706Z | user.registered | User cmvxl58ll000t43hsq6i8d5ua |
| cmvxl5m5m001j43hsljjvz2nl | 2026-11-01T08:46:20.266Z | user.registered | User cmvxl5m5i001f43hslvscre85 |
| cmvxl6i8v001t43hstaw44mnt | 2026-11-01T08:47:01.856Z | user.registered | User cmvxl6i8m001o43hs4iq5g58d |
| cmvxl6vjo002e43hscppmsii2 | 2026-11-01T08:47:19.092Z | user.registered | User cmvxl6vjl002a43hsebh5a10v |
| cmvxl7xzj004r43hsbeghd0gj | 2026-11-01T08:48:08.912Z | user.registered | User cmvxl7xzf004n43hsuw3gchl3 |
| cmvxl81wm005943hsxp75cc0f | 2026-11-01T08:48:13.990Z | user.registered | User cmvxl81wh005443hstvgwewkp |
| cmvxt1g4p005e43hsi3vfwd17 | 2026-11-01T12:27:02.762Z | user.registered | User cmvxt1g4h005a43hs4xvuj5aw |
| cmvxt1yn9005t43hst0rql7tc | 2026-11-01T12:27:26.758Z | user.registered | User cmvxt1yn6005p43hsn2bird1l |
| cmvxt22or006b43hsemytb3bo | 2026-11-01T12:27:31.996Z | user.registered | User cmvxt22oj006643hsha4gd3xt |
| cmvxt2id9006h43hsz3b9yljq | 2026-11-01T12:27:52.317Z | user.registered | User cmvxt2icx006c43hspix7azc1 |
| cmvxt2v6i007243hsf977inq4 | 2026-11-01T12:28:08.922Z | user.registered | User cmvxt2v6c006y43hsbw5l6cmf |
| cmvww8dyv000f43sk94pe7cii | 2026-10-31T21:08:39.224Z | supplier.approved | Supplier cmvww88wl000143sknsjtd6q1 |
| cmvwwcz9q000f43w48yax6ppo | 2026-10-31T21:12:13.455Z | supplier.approved | Supplier cmvwwcu57000143w4g6yupzkj |
| cmvww8afl000943sks04brfn9 | 2026-10-31T21:08:34.641Z | supplier.submitted | Supplier cmvww88wl000143sknsjtd6q1 |
| cmvwwcvlt000943w43riqoza9 | 2026-10-31T21:12:08.705Z | supplier.submitted | Supplier cmvwwcu57000143w4g6yupzkj |
| cmvxipa4e000h43pgnjwcwu32 | 2026-11-01T07:37:38.943Z | supplier.approved | Supplier cmvxiov47000143pgmqa6cvsq |
| cmvxiqxwq002i43pgln75jhnv | 2026-11-01T07:38:56.426Z | supplier.approved | Supplier cmvxiqj3c002243pgb1hkqs14 |
| cmvxiv0tq004x43pgtlfcruo3 | 2026-11-01T07:42:06.831Z | supplier.approved | Supplier cmvxiulox004h43pgy4tfign5 |
| cmvxiye8r007u43pg1s25k5ys | 2026-11-01T07:44:44.187Z | supplier.approved | Supplier cmvxixzb4007e43pgghyy0w7f |
| cmvxj10bd000h439wb0innubv | 2026-11-01T07:46:46.105Z | supplier.approved | Supplier cmvxj0lek0001439wvabep8yq |
| cmvxj68qv000h43v4n30d6to0 | 2026-11-01T07:50:50.311Z | supplier.approved | Supplier cmvxj5t2k000143v4w5n2gnns |
| cmvxj7p2r001c43v4cpdpx23d | 2026-11-01T07:51:58.132Z | supplier.approved | Supplier cmvxj79v6000w43v4snr0bhz9 |
| cmvxjezgb002p43v4v5b18dmw | 2026-11-01T07:57:38.171Z | supplier.approved | Supplier cmvxjekh7002943v4izn1aoou |
| cmvxjyc6b007243v4qffs5uam | 2026-11-01T08:12:41.124Z | supplier.approved | Supplier cmvxjxx4a006m43v4jm6vb7tk |
| cmvxl5ize001a43hs8mwgb0eg | 2026-11-01T08:46:16.154Z | supplier.approved | Supplier cmvxl58ll000u43hsdg6orvln |
| cmvxl6sgg002543hs7uyq5nx0 | 2026-11-01T08:47:15.088Z | supplier.approved | Supplier cmvxl6i8m001p43hsmi75ck8i |
| cmvxt2sl3006t43hshrpjr8bz | 2026-11-01T12:28:05.560Z | supplier.approved | Supplier cmvxt2icx006d43hs9s9ldl21 |
| cmvwwd2rn000p43w47vgragyb | 2026-10-31T21:12:17.988Z | product.approved | Product cmvwwd0wv000h43w4ulibecp8 |
| cmvxipb9j000l43pgafxcwyrz | 2026-11-01T07:37:40.423Z | product.approved | Product cmvxip1c4000743pg3u0ecmxx |
| cmvxiqz1r002m43pgmm46pp3m | 2026-11-01T07:38:57.903Z | product.approved | Product cmvxiqp5x002843pgccvq6bzl |
| cmvxiv1xu005143pgdxt84zhc | 2026-11-01T07:42:08.274Z | product.approved | Product cmvxiurtx004n43pgwtnca3ia |
| cmvxiyfem007y43pg5d3orxfc | 2026-11-01T07:44:45.695Z | product.approved | Product cmvxiy5ha007k43pgoha0lrrb |
| cmvxj11fi000l439wpqs0ojd2 | 2026-11-01T07:46:47.551Z | product.approved | Product cmvxj0rik0007439wgbg35ahd |
| cmvxj69un000l43v4gld6uxff | 2026-11-01T07:50:51.743Z | product.approved | Product cmvxj5zdi000743v4a4n67ftv |
| cmvxj7qa2001g43v4kwgky3i9 | 2026-11-01T07:51:59.691Z | product.approved | Product cmvxj7g2g001243v4u0i4rnmj |
| cmvxjf0kv002t43v4ofzc6aw8 | 2026-11-01T07:57:39.631Z | product.approved | Product cmvxjeqj8002f43v47pkx8w6r |
| cmvxjydba007643v48vv2sxjc | 2026-11-01T08:12:42.598Z | product.approved | Product cmvxjy35y006s43v4c4g956n0 |
| cmvxl5jvh001e43hs5hb4pn4m | 2026-11-01T08:46:17.309Z | product.approved | Product cmvxl5cz2001043hsrqa5t664 |
| cmvxl6tci002943hslvo6kovl | 2026-11-01T08:47:16.242Z | product.approved | Product cmvxl6mkq001v43hs7j9a4l2n |
| cmvxt2tgs006x43hsr4dm0rcr | 2026-11-01T12:28:06.700Z | product.approved | Product cmvxt2mmy006j43hs423cjh55 |
| cmvww8dwx000b43skhk7x32d9 | 2026-10-31T21:08:39.153Z | document.accepted | SupplierDocument cmvww8a6s000543skn1s36ief |
| cmvwwcz72000b43w4kc1h0tal | 2026-10-31T21:12:13.358Z | document.accepted | SupplierDocument cmvwwcvdl000543w49k8dzww0 |
| cmvww2axx001743h4hs0v2d4q | 2026-10-31T21:03:55.365Z | order.created | Order cmvww2awv000t43h4jrod06au |
| cmvwws1ci0017434k0b55apag | 2026-10-31T21:23:55.986Z | order.created | Order cmvwws1bp000t434ktd8n40rd |
| cmvxippda001y43pg8ifimsgr | 2026-11-01T07:37:58.703Z | order.created | Order cmvxippcj001o43pg1v02lcot |
| cmvxircrs003z43pgdv1nwon9 | 2026-11-01T07:39:15.688Z | order.created | Order cmvxircr8003p43pguobg77xv |
| cmvxivfov006e43pgdsk4topg | 2026-11-01T07:42:26.095Z | order.created | Order cmvxivfo7006443pg40v2x7ou |
| cmvxjyqoc008l43v4dpuktdwn | 2026-11-01T08:12:59.917Z | order.created | Order cmvxjyqnt008b43v4rkq1qxkh |
| cmvxk28oe001643jsmcefjds1 | 2026-11-01T08:15:43.215Z | order.created | Order cmvxk28nl000s43js3nqxezcj |
| cmvxl721g003o43hs8s1cc0vh | 2026-11-01T08:47:27.509Z | order.created | Order cmvxl7217003e43hskfg2ywk4 |
| cmvxt31vc008c43hsy6kgb29k | 2026-11-01T12:28:17.593Z | order.created | Order cmvxt31uy008243hsx5zknajd |
