"use client";

// Farmer listing form: create (POST /listings) and edit (PATCH /listings/{id}), plus the small form
// primitives the detail page's enquiry form reuses. Amounts are sent as decimal strings, which the API's
// Decimal(12, 2) fields accept exactly (no float rounding on the way).
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button } from "@/components/ui";
import { AlertIcon } from "@/components/icons";
import { api, describeError, type Listing, type Unit, type User } from "@/lib/api";
import { CROP_OPTIONS, STATES, cropLabel } from "@/lib/format";
import { CropGlyph } from "@/features/market/MarketArt";
import { useMarketLabels } from "@/features/market/i18n";

export const UNITS: Unit[] = ["kg", "quintal", "tonne", "dozen"];

/** quantity is capped at 9,999,999,999; prices and minimum orders fit Decimal(12, 2). */
const MAX_AMOUNT = 9_999_999_999;

export type Amount =
  | { ok: true; value: string; n: number }
  | { ok: false; error: "empty" | "invalid" | "decimals" | "large" };

/** Parse a typed amount into a normalised decimal string (at most 2 decimals, never negative). */
export function parseAmount(raw: string): Amount {
  const s = raw.trim();
  if (s === "") return { ok: false, error: "empty" };
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return { ok: false, error: "invalid" };
  const [whole, frac = ""] = s.split(".");
  if (frac.length > 2) return { ok: false, error: "decimals" };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, error: "invalid" };
  if (n > MAX_AMOUNT) return { ok: false, error: "large" };
  const intPart = whole.replace(/^0+(?=\d)/, "") || "0";
  return { ok: true, value: frac ? `${intPart}.${frac}` : intPart, n };
}

/** "12.50" → "12.5", "40.00" → "40" for pre-filling inputs from API decimals. */
export function plainAmount(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

type A11y = { id: string; "aria-invalid": boolean; "aria-describedby"?: string };

/** Label + control + inline error + hint, with the control wired to both through aria-describedby. */
export function Field({
  id,
  label,
  hint,
  error,
  className = "",
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (a11y: A11y) => ReactNode;
}) {
  const errId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [errId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`km-field ${className}`}>
      <label className="km-label" htmlFor={id}>
        {label}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error && (
        <span id={errId} className="km-error">
          {error}
        </span>
      )}
      {hint && (
        <span id={hintId} className="km-hint">
          {hint}
        </span>
      )}
    </div>
  );
}

/** Form-level error. The live region is always mounted so a new message is announced. */
export function FormError({ message }: { message: string | null }) {
  return (
    <div className="kmx-form-error" aria-live="assertive" aria-atomic="true">
      {message && (
        <p className="kmx-inline-note bad">
          <AlertIcon size={14} style={{ flex: "none", marginTop: 1 }} />
          <span>{message}</span>
        </p>
      )}
    </div>
  );
}

type FieldKey = "crop" | "title" | "quantity" | "price" | "minOrder" | "description" | "state" | "district";
/** Visual order, so the first invalid field can take focus. */
const FIELD_ORDER: FieldKey[] = ["crop", "title", "quantity", "price", "minOrder", "description", "state", "district"];

export function ListingForm({
  user,
  listing,
  onSaved,
  onCancel,
}: {
  user: User;
  /** Present = edit mode. Crop, unit and location are fixed after creation (the API cannot change them). */
  listing?: Listing;
  onSaved: (saved: Listing, kind: "created" | "updated") => void;
  onCancel: () => void;
}) {
  const { t, lang, unitLabel } = useMarketLabels();
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;
  const sectionRef = useRef<HTMLElement>(null);
  const cropRef = useRef<HTMLSelectElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const [crop, setCrop] = useState(listing?.crop_code ?? "");
  const [unit, setUnit] = useState<Unit>(listing?.unit ?? "quintal");
  const [title, setTitle] = useState(listing?.title ?? "");
  const [description, setDescription] = useState(listing?.description ?? "");
  const [quantity, setQuantity] = useState(plainAmount(listing?.quantity));
  const [price, setPrice] = useState(plainAmount(listing?.price_per_unit));
  const [minOrder, setMinOrder] = useState(plainAmount(listing?.min_order_qty));
  const [status, setStatus] = useState<"open" | "closed">(listing?.status === "closed" ? "closed" : "open");
  const [state, setState] = useState(user.state ?? "");
  const [district, setDistrict] = useState(user.district ?? "");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Bring the form into view and put the cursor in its first field when it opens.
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    (cropRef.current ?? titleRef.current)?.focus({ preventScroll: true });
  }, []);

  const hidden = listing?.status === "hidden";
  const unitText = unitLabel(listing?.unit ?? unit);
  const stateOptions =
    !user.state || STATES.some((s) => s.value === user.state) ? STATES : [{ value: user.state, hi: user.state }, ...STATES];

  function amountMessage(a: Extract<Amount, { ok: false }>, fallback: string): string {
    if (a.error === "decimals") return t("market.decimalsInvalid");
    if (a.error === "large") return t("market.numberTooLarge");
    return fallback;
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;

    const next: Partial<Record<FieldKey, string>> = {};
    const cleanTitle = title.trim();
    const cleanDesc = description.trim();
    const cleanDistrict = district.trim();

    if (!listing && !crop) next.crop = t("market.cropRequired");
    if (!cleanTitle) next.title = t("market.titleRequired");
    else if (cleanTitle.length > 120) next.title = t("market.titleTooLong");
    if (cleanDesc.length > 1000) next.description = t("market.descriptionTooLong");

    const qty = parseAmount(quantity);
    if (!qty.ok) next.quantity = amountMessage(qty, t("market.quantityRequired"));
    else if (qty.n <= 0) next.quantity = t("market.quantityRequired");

    const pr = price.trim() ? parseAmount(price) : null;
    if (pr && !pr.ok) next.price = amountMessage(pr, t("market.priceInvalid"));

    const mo = minOrder.trim() ? parseAmount(minOrder) : null;
    if (mo && !mo.ok) next.minOrder = amountMessage(mo, t("market.minOrderPositive"));
    else if (mo?.ok && mo.n <= 0) next.minOrder = t("market.minOrderPositive");
    else if (mo?.ok && qty.ok && mo.n > qty.n) next.minOrder = t("market.minOrderTooBig");

    if (!listing && !state) next.state = t("market.stateRequired");
    if (!listing && !cleanDistrict) next.district = t("market.districtRequired");

    const firstBad = FIELD_ORDER.find((k) => next[k]);
    if (firstBad || !qty.ok) {
      setErrors(next);
      setFormError(t("market.fixErrors"));
      if (firstBad) document.getElementById(fid(firstBad))?.focus();
      return;
    }

    const priceValue = pr?.ok ? pr.value : null;
    const minValue = mo?.ok ? mo.value : null;
    let body: Record<string, unknown>;
    if (listing) {
      // Owner PATCH: send every editable field so clearing price / minimum / description works.
      body = {
        title: cleanTitle,
        description: cleanDesc || null,
        quantity: qty.value,
        price_per_unit: priceValue,
        min_order_qty: minValue,
      };
      // A hidden listing's status belongs to the moderator; the API rejects any status change.
      if (!hidden) body.status = status;
    } else {
      body = { crop_code: crop, title: cleanTitle, quantity: qty.value, unit };
      if (cleanDesc) body.description = cleanDesc;
      if (priceValue !== null) body.price_per_unit = priceValue;
      if (minValue !== null) body.min_order_qty = minValue;
      // Omitted state/district default to the farmer's profile on the server.
      if (state !== user.state) body.state = state;
      if (cleanDistrict !== (user.district ?? "").trim()) body.district = cleanDistrict;
    }

    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const saved = await api<Listing>(listing ? `/listings/${encodeURIComponent(listing.id)}` : "/listings", {
        method: listing ? "PATCH" : "POST",
        body,
      });
      onSaved(saved, listing ? "updated" : "created");
    } catch (err) {
      setFormError(describeError(err));
      setSaving(false);
    }
  }

  const amountInput = { className: "km-input", type: "text", inputMode: "decimal", autoComplete: "off" } as const;

  return (
    <section ref={sectionRef} className="km-panel kmx-form-panel" aria-labelledby={fid("heading")}>
      <header className="km-panel-head">
        <h2 className="km-panel-title" id={fid("heading")}>
          {listing ? t("market.editTitle") : t("market.createTitle")}
        </h2>
        {hidden && (
          <span style={{ marginLeft: "auto" }}>
            <Badge tone="bad">{t("market.hiddenByModerator")}</Badge>
          </span>
        )}
      </header>
      <div className="km-panel-body">
        <form className="kmx-form" onSubmit={submit} noValidate aria-busy={saving}>
          <p className="km-caption">{listing ? t("market.editSubtitle") : t("market.createSubtitle")}</p>

          {listing && (
            <p className="kmx-inline-note info">
              <CropGlyph crop={listing.crop_code} size={14} />
              <span>
                {t("market.cropUnitSummary", { crop: cropLabel(listing.crop_code, lang), unit: unitText })}
                {" · "}
                {t("market.location", { district: listing.district, state: listing.state })}
              </span>
            </p>
          )}
          {hidden && <p className="kmx-inline-note warn">{t("market.hiddenNote")}</p>}

          <div className="kmx-form-grid">
            {!listing && (
              <>
                <Field id={fid("crop")} label={t("market.formCrop")} error={errors.crop}>
                  {(a) => (
                    <select ref={cropRef} {...a} className="km-select" value={crop} onChange={(e) => setCrop(e.target.value)}>
                      <option value="">{t("market.chooseCrop")}</option>
                      {CROP_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {cropLabel(c, lang)}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field id={fid("unit")} label={t("market.formUnit")}>
                  {(a) => (
                    <select {...a} className="km-select" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {unitLabel(u)}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </>
            )}
            <Field
              id={fid("title")}
              className={listing && !hidden ? "" : "span-2"}
              label={t("market.formTitle")}
              error={errors.title}
            >
              {(a) => (
                <input
                  ref={titleRef}
                  {...a}
                  className="km-input"
                  type="text"
                  maxLength={120}
                  placeholder={t("market.formTitlePlaceholder")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
            </Field>
            {listing && !hidden && (
              <Field id={fid("status")} label={t("market.formStatus")}>
                {(a) => (
                  <select
                    {...a}
                    className="km-select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value === "closed" ? "closed" : "open")}
                  >
                    <option value="open">{t("market.statusOpenOption")}</option>
                    <option value="closed">{t("market.statusClosedOption")}</option>
                  </select>
                )}
              </Field>
            )}
          </div>

          <div className="kmx-form-grid three">
            <Field id={fid("quantity")} label={`${t("market.formQuantity")} (${unitText})`} error={errors.quantity}>
              {(a) => <input {...a} {...amountInput} value={quantity} onChange={(e) => setQuantity(e.target.value)} />}
            </Field>
            <Field id={fid("price")} label={t("market.formPrice")} hint={t("market.formPriceHint")} error={errors.price}>
              {(a) => <input {...a} {...amountInput} value={price} onChange={(e) => setPrice(e.target.value)} />}
            </Field>
            <Field
              id={fid("minOrder")}
              label={t("market.formMinOrder")}
              hint={t("market.formMinOrderHint")}
              error={errors.minOrder}
            >
              {(a) => <input {...a} {...amountInput} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />}
            </Field>
          </div>

          <div className="kmx-form-grid">
            <Field
              id={fid("description")}
              className="span-2"
              label={t("market.formDescription")}
              hint={t("market.formDescriptionHint")}
              error={errors.description}
            >
              {(a) => (
                <textarea
                  {...a}
                  className="km-textarea"
                  rows={3}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              )}
            </Field>
            {!listing && (
              <>
                <Field id={fid("state")} label={t("market.formState")} hint={t("market.locationHint")} error={errors.state}>
                  {(a) => (
                    <select {...a} className="km-select" value={state} onChange={(e) => setState(e.target.value)}>
                      <option value="">{t("market.chooseState")}</option>
                      {stateOptions.map((s) => (
                        <option key={s.value} value={s.value}>
                          {lang === "hi" ? s.hi : s.value}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field id={fid("district")} label={t("market.formDistrict")} error={errors.district}>
                  {(a) => (
                    <input
                      {...a}
                      className="km-input"
                      type="text"
                      maxLength={60}
                      autoComplete="address-level2"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                    />
                  )}
                </Field>
              </>
            )}
          </div>

          <FormError message={formError} />

          <div className="kmx-form-actions">
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving
                ? listing
                  ? t("market.savingListing")
                  : t("market.creatingListing")
                : listing
                  ? t("market.saveListing")
                  : t("market.createListing")}
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              {t("market.cancel")}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
