import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatDate } from '../format';
import type { VerifyResponse } from '../types';

async function verify(number: string): Promise<VerifyResponse> {
  const res = await fetch(`/api/v1/public/verify/${encodeURIComponent(number)}`);
  if (res.status === 429) throw new Error('Too many checks from your network. Please wait a minute.');
  if (res.status !== 200 && res.status !== 404) throw new Error('Verification service unavailable. Try again shortly.');
  return (await res.json()) as VerifyResponse;
}

/** Public page, no login. Opened directly from the QR code on a certificate. */
export function VerifyPage() {
  const { number } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(number ?? '');
  const { data, isFetching, error } = useQuery({
    queryKey: ['verify', number],
    queryFn: () => verify(number!),
    enabled: !!number,
    retry: false,
    staleTime: 0,
  });

  return (
    <main className="page narrow">
      <h1>Verify a certificate</h1>
      <p className="muted">Pragati Skills Mission. Enter the certificate number printed on the certificate, or scan its QR code.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) navigate(`/verify/${encodeURIComponent(input.trim().toUpperCase())}`);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="PSM-2026-XXXXXXXXXXX" aria-label="Certificate number" />
        <button className="btn">Verify</button>
      </form>

      {isFetching && <p>Checking...</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      {data && !isFetching && (
        <div className={`verdict verdict-${data.result.toLowerCase()}`}>
          <div className="verdict-title">
            {data.result === 'VALID' ? '✔ VALID' : data.result === 'REVOKED' ? '✖ REVOKED' : '? NOT FOUND'}
          </div>
          {data.result === 'NOT_FOUND' ? (
            <p>No certificate with this number exists. Check for typos; it may be forged.</p>
          ) : (
            <dl>
              <dt>Certificate</dt>
              <dd>{data.certificate.certificateNumber}</dd>
              <dt>Holder</dt>
              <dd>{data.certificate.holderName}</dd>
              <dt>Course</dt>
              <dd>{data.certificate.courseName}</dd>
              <dt>Training centre</dt>
              <dd>
                {data.certificate.centreName}, {data.certificate.districtName}
              </dd>
              <dt>Issued on</dt>
              <dd>{formatDate(data.certificate.issuedOn)}</dd>
              {data.certificate.revokedOn && (
                <>
                  <dt>Revoked on</dt>
                  <dd>{formatDate(data.certificate.revokedOn)}</dd>
                </>
              )}
            </dl>
          )}
        </div>
      )}
      <p className="muted small">For privacy, only initials of the holder's name are shown. No phone numbers or IDs are ever displayed.</p>
    </main>
  );
}
