'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  History,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GatedButton } from '@/components/ui/gated-button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/dashboard/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { hasMinRole } from '@/lib/auth/roles';
import {
  fetchOnboarding,
  type OnboardingClientError,
} from '@/lib/clinicconnect/onboarding-api-client';
import {
  fetchWhatsappConsent,
  recordWhatsappConsent,
  WhatsappConsentClientError,
} from '@/lib/clinicconnect/whatsapp-consent-api-client';
import type {
  ConsentEventType,
  WhatsappConsentDashboard,
  WhatsappConsentHistory,
  WhatsappContactConsent,
} from '@/lib/clinicconnect/whatsapp-consent';
import {
  fetchWhatsappReadiness,
  runWhatsappDiagnostic,
  WhatsappReadinessClientError,
  type WhatsappDiagnostic,
  type WhatsappReadiness,
} from '@/lib/clinicconnect/whatsapp-readiness-api-client';

function date(value: string | null, locale: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function stateClass(state: WhatsappContactConsent['state']) {
  if (state === 'OPT_IN')
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  if (state === 'OPT_OUT')
    return 'border-red-500/40 bg-red-500/10 text-red-300';
  return 'border-border bg-muted text-muted-foreground';
}

export type WhatsappReadinessState =
  | 'notConfigured'
  | 'incomplete'
  | 'verificationRequired'
  | 'ready'
  | 'connectionIncomplete';

export function getWhatsappReadinessState(
  configuration: WhatsappReadiness['configuration'] | undefined,
  diagnostic: WhatsappDiagnostic | null
): WhatsappReadinessState {
  if (!configuration?.exists) return 'notConfigured';
  if (!configuration.phoneConfigured || configuration.status !== 'connected') {
    return 'incomplete';
  }
  if (diagnostic === null) return 'verificationRequired';
  return diagnostic.live ? 'ready' : 'connectionIncomplete';
}

export default function ClinicWhatsAppPage() {
  const t = useTranslations('ClinicWhatsApp');
  const locale = useLocale();
  const { accountRole } = useAuth();
  const canRecord = accountRole !== null && hasMinRole(accountRole, 'agent');
  const [readiness, setReadiness] = useState<WhatsappReadiness | null>(null);
  const [diagnostic, setDiagnostic] = useState<WhatsappDiagnostic | null>(null);
  const [consent, setConsent] = useState<WhatsappConsentDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<WhatsappConsentHistory | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [recording, setRecording] = useState<string | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [readinessResult, consentResult, onboardingResult] =
        await Promise.allSettled([
          fetchWhatsappReadiness(),
          fetchWhatsappConsent() as Promise<WhatsappConsentDashboard>,
          fetchOnboarding(),
        ]);
      if (readinessResult.status === 'rejected') throw readinessResult.reason;
      if (consentResult.status === 'rejected') throw consentResult.reason;
      setReadiness(readinessResult.value);
      setConsent(consentResult.value);
      setOnboardingStatus(
        onboardingResult.status === 'fulfilled'
          ? onboardingResult.value.onboardingStatus
          : null
      );
    } catch (caught) {
      const message =
        caught instanceof WhatsappReadinessClientError ||
        caught instanceof WhatsappConsentClientError ||
        (caught as OnboardingClientError)?.message
          ? (caught as Error).message
          : t('loadError');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return consent?.contacts ?? [];
    return (consent?.contacts ?? []).filter((contact) =>
      [contact.name, contact.phone, contact.email].some((field) =>
        field?.toLowerCase().includes(value)
      )
    );
  }, [consent, query]);

  const configuration = readiness?.configuration;
  const status = getWhatsappReadinessState(configuration, diagnostic);

  async function diagnose() {
    setDiagnosing(true);
    try {
      setDiagnostic(await runWhatsappDiagnostic());
    } catch (caught) {
      setDiagnostic({
        live: false,
        message:
          caught instanceof WhatsappReadinessClientError
            ? caught.message
            : t('diagnosticError'),
      });
    } finally {
      setDiagnosing(false);
    }
  }

  async function openHistory(contactId: string) {
    try {
      setHistory(
        (await fetchWhatsappConsent(fetch, contactId)) as WhatsappConsentHistory
      );
      setHistoryOpen(true);
    } catch (caught) {
      setError(
        caught instanceof WhatsappConsentClientError
          ? caught.message
          : t('historyError')
      );
    }
  }

  async function record(contactId: string, eventType: ConsentEventType) {
    setRecording(`${contactId}:${eventType}`);
    try {
      await recordWhatsappConsent({
        contactId,
        eventType,
        source: 'clinicconnect_ui',
      });
      const next = (await fetchWhatsappConsent()) as WhatsappConsentDashboard;
      setConsent(next);
    } catch (caught) {
      setError(
        caught instanceof WhatsappConsentClientError
          ? caught.message
          : t('recordError')
      );
    } finally {
      setRecording(null);
    }
  }

  if (loading)
    return (
      <div className="space-y-4" role="status" aria-label={t('loading')}>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-44" />
        <Skeleton className="h-80" />
      </div>
    );
  if (error && !readiness && !consent)
    return (
      <div className="space-y-4" role="alert">
        <Alert variant="destructive">
          <AlertTitle>{t('loadTitle')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => void refresh()}>
          <RefreshCw /> {t('retry')}
        </Button>
      </div>
    );

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <Button
            render={<Link href="/clinicconnect" />}
            variant="ghost"
            size="icon"
            aria-label={t('back')}
          >
            <ArrowLeft />
          </Button>
          <div>
            <p className="text-primary text-sm font-medium">ClinicConnect</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('title')}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('description')}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void refresh()}>
          <RefreshCw /> {t('refresh')}
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t('attention')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>{t('overall')}</CardDescription>
            <CardTitle className="flex items-center gap-2">
              {status === 'ready' ? (
                <CheckCircle2 className="text-emerald-400" />
              ) : (
                <ShieldAlert className="text-amber-400" />
              )}
              {t(`states.${status}`)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {status === 'notConfigured'
              ? t('next.configure')
              : status === 'verificationRequired'
                ? t('next.verify')
                : status === 'connectionIncomplete'
                  ? (diagnostic?.message ??
                    diagnostic?.errors?.[0] ??
                    t('next.registration'))
                  : status === 'ready'
                    ? t('next.ready')
                    : t('next.complete')}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t('configuration')}</CardDescription>
            <CardTitle>
              {configuration?.exists
                ? configuration.status
                : t('notConfigured')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1 text-sm">
            <p>
              {t('phoneConfigured')}:{' '}
              {configuration?.phoneConfigured ? t('yes') : t('no')}
            </p>
            <p>
              {t('connectedAt')}:{' '}
              {date(configuration?.connectedAt ?? null, locale)}
            </p>
            <p>
              {t('registration')}:{' '}
              {configuration?.registeredAt ? t('complete') : t('incomplete')}
            </p>
            <Button
              render={<Link href="/settings?tab=whatsapp" />}
              variant="link"
              className="h-auto px-0"
            >
              {t('openConfiguration')} <ExternalLink />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t('diagnostics')}</CardDescription>
            <CardTitle>
              {diagnostic
                ? diagnostic.live
                  ? t('verified')
                  : t('blocked')
                : t('notRun')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-3 text-sm">
            <p>
              {diagnostic?.errors?.[0] ??
                diagnostic?.message ??
                t('diagnosticHint')}
            </p>
            <Button onClick={() => void diagnose()} disabled={diagnosing}>
              {diagnosing ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RefreshCw />
              )}{' '}
              {t('runDiagnostics')}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t('templates')}</CardDescription>
            <CardTitle>
              {readiness?.templates.approved ?? 0} {t('approved')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            <p>
              {readiness?.templates.total ?? 0} {t('total')} ·{' '}
              {readiness?.templates.pending ?? 0} {t('pending')}
            </p>
            <p className="mt-2">
              {readiness?.templates.usable
                ? t('templatesReady')
                : t('templatesUnavailable')}
            </p>
            <Button
              render={<Link href="/settings?tab=templates" />}
              variant="link"
              className="h-auto px-0"
            >
              {t('manageTemplates')} <ExternalLink />
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle /> {t('consentTitle')}
          </CardTitle>
          <CardDescription>{t('consentDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric
              label={t('totalContacts')}
              value={consent?.summary.totalContacts ?? 0}
            />
            <Metric
              label={t('optedIn')}
              value={consent?.summary.optedIn ?? 0}
            />
            <Metric
              label={t('optedOut')}
              value={consent?.summary.optedOut ?? 0}
            />
            <Metric
              label={t('unknown')}
              value={consent?.summary.unknown ?? 0}
            />
          </div>
          <div className="flex items-center gap-2">
            <Search className="text-muted-foreground size-4" />
            <Input
              aria-label={t('search')}
              placeholder={t('search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {!canRecord ? (
            <Alert>
              <AlertTitle>{t('readOnly')}</AlertTitle>
              <AlertDescription>{t('readOnlyBody')}</AlertDescription>
            </Alert>
          ) : null}
          {filtered.length === 0 ? (
            <p className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
              {query ? t('noMatches') : t('noContacts')}
            </p>
          ) : (
            <div className="divide-border border-border divide-y rounded-lg border">
              {filtered.map((contact) => (
                <div
                  key={contact.contactId}
                  className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {contact.name || t('unnamed')}
                      </p>
                      {contact.isPatient ? (
                        <Badge variant="outline">{t('patient')}</Badge>
                      ) : null}
                      <Badge className={stateClass(contact.state)}>
                        {contact.state === 'UNKNOWN'
                          ? t('states.unknown')
                          : contact.state === 'OPT_IN'
                            ? t('states.optIn')
                            : t('states.optOut')}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {contact.phone}
                      {contact.email ? ` · ${contact.email}` : ''}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {contact.latest
                        ? `${t('latest')}: ${date(contact.latest.occurredAt, locale)} · ${contact.latest.source}`
                        : t('noEvent')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <GatedButton
                      canAct={canRecord}
                      gateReason={t('recordGate')}
                      variant="outline"
                      size="sm"
                      disabled={recording !== null}
                      onClick={() => void record(contact.contactId, 'OPT_IN')}
                    >
                      {recording === `${contact.contactId}:OPT_IN` ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <CheckCircle2 />
                      )}{' '}
                      {t('optIn')}
                    </GatedButton>
                    <GatedButton
                      canAct={canRecord}
                      gateReason={t('recordGate')}
                      variant="outline"
                      size="sm"
                      disabled={recording !== null}
                      onClick={() => void record(contact.contactId, 'OPT_OUT')}
                    >
                      {recording === `${contact.contactId}:OPT_OUT` ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <XCircle />
                      )}{' '}
                      {t('optOut')}
                    </GatedButton>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void openHistory(contact.contactId)}
                    >
                      <History /> {t('history')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-xs">
        {t('onboardingStatus')}: {onboardingStatus ?? t('unknownStatus')}
      </p>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('historyTitle')}</DialogTitle>
            <DialogDescription>
              {history?.contact.name || history?.contact.phone} ·{' '}
              {t('appendOnly')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {history?.events.length ? (
              history.events.map((event) => (
                <div
                  key={event.id}
                  className="border-border rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge className={stateClass(event.eventType)}>
                      {event.eventType === 'OPT_IN'
                        ? t('states.optIn')
                        : t('states.optOut')}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {date(event.occurredAt, locale)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {t('source')}: {event.source}
                  </p>
                  {event.recordedByName ? (
                    <p className="text-muted-foreground text-xs">
                      {t('recordedBy')}: {event.recordedByName}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">{t('noEvent')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border bg-muted/30 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
