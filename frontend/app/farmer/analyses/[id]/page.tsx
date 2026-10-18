"use client";

import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AnalysisResult } from "@/components/AnalysisResult";
import { FormError, Loading, Screen } from "@/components/ui";
import { api, ApiError, type Analysis } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

function AnalysisView() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { user } = useSession(["farmer"]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api<Analysis>(`/analyses/${id}`)
      .then(setAnalysis)
      .catch((e) => setError(t(e instanceof ApiError && (e.status === 404 || e.status === 422)
        ? "result.notFound" : errorKey(e))));
  }, [user, id, t]);

  return (
    <Screen title={t("result.pageTitle")} back="/farmer">
      {error ? <FormError message={error} /> : analysis ? <AnalysisResult analysis={analysis} /> : <Loading />}
    </Screen>
  );
}

// The id comes from the URL, which cacheComponents treats as request data: it must sit inside <Suspense>.
// Report generation (FE-05) will be added below the result on this page.
export default function AnalysisPage() {
  return (
    <Suspense fallback={<Screen back="/farmer"><Loading /></Screen>}>
      <AnalysisView />
    </Suspense>
  );
}
