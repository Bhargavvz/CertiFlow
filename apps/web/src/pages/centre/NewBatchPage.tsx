// Wizard step 1: batch details. Creating the draft here means the upload step can
// be resumed later from the dashboard if the centre closes the tab.
import { zodResolver } from '@hookform/resolvers/zod';
import { createBatchSchema } from '@certiflow/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Info } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import type { z } from 'zod';
import { api } from '../../api';
import { PageHeader } from '../../components/Display';
import { Button } from '../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { Field, Input } from '../../components/ui/form';
import { COLUMN_HELP, downloadTemplate } from '../../components/upload/template';
import { WizardSteps } from '../../components/upload/WizardSteps';
import { notify, notifyError } from '../../toast';
import type { BatchSummary } from '../../types';

type FormValues = z.infer<typeof createBatchSchema>;

export default function NewBatchPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const form = useForm<FormValues>({ resolver: zodResolver(createBatchSchema), defaultValues: { courseName: '' } });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { batch } = await api<{ batch: BatchSummary }>('/batches', { method: 'POST', json: values });
      void qc.invalidateQueries({ queryKey: ['batches'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      notify('Draft batch created', 'success');
      navigate(`/batches/${batch.id}/prepare`, { replace: true });
    } catch (e) {
      notifyError(e, 'Couldn’t create the batch');
    }
  });

  const err = form.formState.errors.courseName?.message;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New batch"
        description="A batch is one course cohort from your centre. It goes through review as one unit."
        breadcrumb={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Batches', to: '/batches' }, { label: 'New batch' }]}
      />
      <WizardSteps current={0} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader title="Batch details" />
          <CardBody>
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
              <Field id="courseName" label="Course name" hint="Printed on every certificate in this batch, e.g. “Electrician Helper”." error={err}>
                <Input
                  id="courseName"
                  autoFocus
                  autoComplete="off"
                  maxLength={120}
                  aria-invalid={!!err}
                  aria-describedby={err ? 'courseName-error' : 'courseName-hint'}
                  {...form.register('courseName')}
                />
              </Field>
              <div className="flex items-center justify-between gap-3">
                <Link to="/dashboard" className="text-body text-muted hover:text-fg">
                  Cancel
                </Link>
                <Button type="submit" loading={form.formState.isSubmitting}>
                  Continue to upload
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card className="h-fit">
          <CardHeader title="What you’ll need" description="One spreadsheet row per candidate who passed." />
          <CardBody className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2">
              {COLUMN_HELP.map((c) => (
                <li key={c.column} className="text-caption">
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-fg">{c.column}</code>
                  {!c.required && <span className="ml-1.5 text-subtle">optional</span>}
                  <span className="mt-0.5 block text-muted">{c.help}</span>
                </li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" onClick={downloadTemplate} className="self-start">
              <Download aria-hidden /> Download template (CSV)
            </Button>
            <p className="flex gap-2 rounded-md bg-primary-soft px-3 py-2 text-caption text-primary-soft-fg">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              The whole file is checked before anything is saved, so a mistake never leaves half a batch behind.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
