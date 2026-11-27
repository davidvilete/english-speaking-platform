"use client";

import { useActionState, useState, useTransition } from "react";
import { CreditCard, ShieldAlert, XCircle } from "lucide-react";
import {
  activateManualSubscriptionAction,
  cancelSubscriptionAtPeriodEndAction,
  refundAndCancelImmediatelyAction,
  type BillingActionState,
} from "@/modules/billing/actions";
import { PLAN_CATALOG } from "@/modules/billing/domain";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import type {
  PlanCode,
  ProficiencyLevel,
  SubscriptionStatus,
} from "@/shared/types/database";

export interface AdminStudentOption {
  id: string;
  fullName: string;
  proficiencyLevel: ProficiencyLevel | null;
}

export interface AdminSubscriptionView {
  id: string;
  studentName: string;
  studentLevel: ProficiencyLevel | null;
  planCode: PlanCode;
  status: SubscriptionStatus;
  weeklyLimit: number;
  periodStartFormatted: string;
  periodEndFormatted: string;
  withinCdcWindow: boolean;
  cdcDaysRemaining: number;
}

const initialState: BillingActionState = {};

export function AdminSubscriptionsClient({
  students,
  subscriptions,
}: {
  students: AdminStudentOption[];
  subscriptions: AdminSubscriptionView[];
}) {
  const [formState, formAction, isActivating] = useActionState(
    activateManualSubscriptionAction,
    initialState,
  );
  const [actionFeedback, setActionFeedback] = useState<BillingActionState>({});
  const [isUpdating, startTransition] = useTransition();

  function handleCancelNetflix(subscriptionId: string) {
    setActionFeedback({});
    startTransition(async () => {
      const res = await cancelSubscriptionAtPeriodEndAction(subscriptionId);
      setActionFeedback(res);
    });
  }

  function handleRefundCdc(subscriptionId: string) {
    setActionFeedback({});
    startTransition(async () => {
      const res = await refundAndCancelImmediatelyAction(subscriptionId);
      setActionFeedback(res);
    });
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">
              Ativar ou Renovar Assinatura Manual (Pix / Piloto)
            </CardTitle>
          </div>
          <CardDescription>
            Operação custo zero no piloto e contingência permanente. Plano
            comercial controla apenas franquia e vigência — nunca altera o nível
            de fala do aluno.
          </CardDescription>
        </CardHeader>

        <form action={formAction}>
          <CardContent className="space-y-4">
            {formState.error ? (
              <Alert variant="destructive">
                <AlertDescription>{formState.error}</AlertDescription>
              </Alert>
            ) : null}

            {formState.success ? (
              <Alert variant="success">
                <AlertDescription>{formState.success}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="studentId">Aluno</Label>
                <select
                  id="studentId"
                  name="studentId"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Selecione um aluno...</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.fullName}
                      {student.proficiencyLevel
                        ? ` (${student.proficiencyLevel})`
                        : " (Sem nível)"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="planCode">Plano Comercial</Label>
                <select
                  id="planCode"
                  name="planCode"
                  defaultValue="basic_1x"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="trial">
                    {PLAN_CATALOG.trial.name} — {PLAN_CATALOG.trial.priceLabel}
                  </option>
                  <option value="basic_1x">
                    {PLAN_CATALOG.basic_1x.name} —{" "}
                    {PLAN_CATALOG.basic_1x.priceLabel}
                  </option>
                  <option value="intermediate_2x">
                    {PLAN_CATALOG.intermediate_2x.name} —{" "}
                    {PLAN_CATALOG.intermediate_2x.priceLabel}
                  </option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="durationDays">Vigência (dias)</Label>
                <Input
                  id="durationDays"
                  name="durationDays"
                  type="number"
                  min={7}
                  max={365}
                  defaultValue={30}
                  required
                />
              </div>
            </div>
          </CardContent>

          <CardFooter>
            <Button type="submit" disabled={isActivating}>
              {isActivating
                ? "Ativando assinatura..."
                : "Ativar / Renovar plano"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          Assinaturas registradas ({subscriptions.length})
        </h2>

        {actionFeedback.error ? (
          <Alert variant="destructive">
            <AlertDescription>{actionFeedback.error}</AlertDescription>
          </Alert>
        ) : null}

        {actionFeedback.success ? (
          <Alert variant="success">
            <AlertDescription>{actionFeedback.success}</AlertDescription>
          </Alert>
        ) : null}

        {subscriptions.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Nenhuma assinatura registrada ainda
              </CardTitle>
              <CardDescription>
                Use o formulário acima para ativar manualmente planos Trial,
                Basic ou Intermediate.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-4">
            {subscriptions.map((sub) => {
              const plan = PLAN_CATALOG[sub.planCode];
              return (
                <Card key={sub.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          {sub.studentName}
                        </CardTitle>
                        <CardDescription>
                          {plan.name} ({plan.priceLabel}) • Vigência:{" "}
                          {sub.periodStartFormatted} até{" "}
                          {sub.periodEndFormatted}
                        </CardDescription>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {sub.withinCdcWindow && sub.status !== "canceled" ? (
                          <Badge variant="warning">
                            <ShieldAlert className="mr-1 h-3 w-3" />
                            CDC 7 dias ({sub.cdcDaysRemaining}d restantes)
                          </Badge>
                        ) : null}

                        <Badge
                          variant={
                            sub.status === "active"
                              ? "success"
                              : sub.status === "cancel_at_period_end"
                                ? "warning"
                                : "outline"
                          }
                        >
                          {sub.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  {sub.status === "active" ||
                  sub.status === "cancel_at_period_end" ? (
                    <CardFooter className="flex flex-wrap items-center gap-2">
                      {sub.status === "active" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isUpdating}
                          onClick={() => handleCancelNetflix(sub.id)}
                        >
                          Cancelar ao fim do ciclo (Netflix)
                        </Button>
                      ) : null}

                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={isUpdating}
                        onClick={() => handleRefundCdc(sub.id)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {sub.withinCdcWindow
                          ? "Estornar (CDC 7 dias) e cancelar agora"
                          : "Revogar acesso imediatamente"}
                      </Button>
                    </CardFooter>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
