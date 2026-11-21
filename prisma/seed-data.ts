// Demo reference data shared by the seed script and the test suite, so tests run
// against exactly the users and scopes the demo uses.
import type { District, Prisma, PrismaClient, TrainingCentre, User } from '@prisma/client';

export const DISTRICTS = [
  { code: 'NGP', name: 'Nagpur' },
  { code: 'AMR', name: 'Amravati' },
] as const;

export const CENTRES = [
  { code: 'NGP-001', name: 'Pragati Skills Centre, Nagpur', district: 'NGP' },
  { code: 'AMR-001', name: 'Vidarbha Training Institute, Amravati', district: 'AMR' },
] as const;

export type DemoUserKey = 'anika' | 'dev' | 'meera' | 'kabir' | 'neha' | 'farah' | 'ravi' | 'isha';

interface DemoUserDef {
  key: DemoUserKey;
  name: string;
  role: 'CENTRE' | 'DISTRICT_OFFICER' | 'QUALITY' | 'STATE';
  centre?: string;
  district?: string;
  /** Extra users exist only to demonstrate/test cross-district isolation. */
  extra?: boolean;
  title: string;
}

export const DEMO_USERS: DemoUserDef[] = [
  { key: 'anika', name: 'Anika Sharma', role: 'CENTRE', centre: 'NGP-001', title: 'Training centre, Nagpur' },
  { key: 'dev', name: 'Dev Patel', role: 'DISTRICT_OFFICER', district: 'NGP', title: 'District officer, Nagpur' },
  { key: 'meera', name: 'Meera Iyer', role: 'DISTRICT_OFFICER', district: 'NGP', title: 'District officer, Nagpur' },
  { key: 'kabir', name: 'Kabir Khan', role: 'DISTRICT_OFFICER', district: 'NGP', title: 'District officer, Nagpur' },
  { key: 'neha', name: 'Neha Joshi', role: 'QUALITY', title: 'Quality team (state-wide)' },
  { key: 'farah', name: 'Farah Ali', role: 'STATE', title: 'State skills office' },
  { key: 'ravi', name: 'Ravi Kulkarni', role: 'CENTRE', centre: 'AMR-001', extra: true, title: 'Training centre, Amravati' },
  { key: 'isha', name: 'Isha Deshmukh', role: 'DISTRICT_OFFICER', district: 'AMR', extra: true, title: 'District officer, Amravati' },
];

export interface ReferenceData {
  districts: Record<string, District>;
  centres: Record<string, TrainingCentre>;
  users: Record<DemoUserKey, User>;
}

/** Idempotent: safe to run on every container start. */
export async function seedReferenceData(prisma: PrismaClient): Promise<ReferenceData> {
  const districts: Record<string, District> = {};
  for (const d of DISTRICTS) {
    districts[d.code] = await prisma.district.upsert({
      where: { code: d.code },
      update: { name: d.name },
      create: { code: d.code, name: d.name },
    });
  }

  const centres: Record<string, TrainingCentre> = {};
  for (const c of CENTRES) {
    centres[c.code] = await prisma.trainingCentre.upsert({
      where: { code: c.code },
      update: { name: c.name, districtId: districts[c.district]!.id },
      create: { code: c.code, name: c.name, districtId: districts[c.district]!.id },
    });
  }

  const users = {} as Record<DemoUserKey, User>;
  for (const u of DEMO_USERS) {
    const centre = u.centre ? centres[u.centre]! : null;
    const data = {
      name: u.name,
      email: `${u.key}@demo.certiflow.test`,
      role: u.role,
      centreId: centre?.id ?? null,
      // A centre user's district is the centre's district; officers have their own.
      districtId: centre ? centre.districtId : u.district ? districts[u.district]!.id : null,
    };
    users[u.key] = await prisma.user.upsert({ where: { key: u.key }, update: data, create: { key: u.key, ...data } });
  }

  return { districts, centres, users };
}

const FIRST = ['Aarav', 'Priya', 'Rohan', 'Sneha', 'Vikram', 'Pooja', 'Arjun', 'Kavya', 'Sahil', 'Divya', 'Nikhil', 'Ananya', 'Yash', 'Ishita', 'Manav', 'Riya'];
const LAST = ['Wankhede', 'Deshpande', 'Gupta', 'Patil', 'Rao', 'Naidu', 'Shaikh', 'Joshi', 'Kale', 'Pawar', 'Bose', 'Menon'];

export interface DemoCandidate {
  fullName: string;
  phone: string;
  enrolmentId: string;
  score: number;
  passedOn: Date;
  dob: Date | null;
}

/** Deterministic fake candidates. Phones are unique per (prefix, index). */
export function demoCandidates(count: number, prefix: string, phoneBlock = 0): DemoCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    fullName: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    phone: `+9198${String(phoneBlock).padStart(3, '0')}${String(i).padStart(5, '0')}`,
    enrolmentId: `${prefix}-${String(i + 1).padStart(4, '0')}`,
    score: 55 + ((i * 7) % 45),
    passedOn: new Date('2026-10-15T00:00:00Z'),
    dob: new Date(`${2000 + (i % 6)}-0${1 + (i % 9)}-1${i % 9}T00:00:00Z`),
  }));
}

/**
 * A few batches in different states so every role has something to look at right
 * after `docker compose up`. Only runs on an empty database.
 */
export async function seedDemoBatches(prisma: PrismaClient, refs: ReferenceData): Promise<number> {
  if ((await prisma.batch.count()) > 0) return 0;
  const { users, centres } = refs;
  const ngp = centres['NGP-001']!;
  const amr = centres['AMR-001']!;
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3600_000);

  type Seeded = {
    course: string;
    centre: TrainingCentre;
    createdBy: User;
    status: Prisma.BatchCreateInput['status'];
    candidates: number;
    prefix: string;
    enteredHoursAgo: number;
    approvals?: { by: User; step: 'DISTRICT' | 'QUALITY'; decision: 'APPROVE' | 'SEND_BACK'; reason?: string }[];
    sendBackReason?: string;
  };

  const plan: Seeded[] = [
    { course: 'Retail Sales Associate', centre: ngp, createdBy: users.anika, status: 'DRAFT', candidates: 5, prefix: 'RSA26', enteredHoursAgo: 0 },
    {
      course: 'Electrician Helper', centre: ngp, createdBy: users.anika, status: 'PENDING_DISTRICT', candidates: 8, prefix: 'ELH26', enteredHoursAgo: 5,
      approvals: [{ by: users.dev, step: 'DISTRICT', decision: 'APPROVE' }],
    },
    {
      course: 'Data Entry Operator', centre: ngp, createdBy: users.anika, status: 'PENDING_STATE', candidates: 6, prefix: 'DEO26', enteredHoursAgo: 60,
      approvals: [
        { by: users.dev, step: 'DISTRICT', decision: 'APPROVE' },
        { by: users.meera, step: 'DISTRICT', decision: 'APPROVE' },
      ],
    },
    {
      course: 'Solar PV Installer', centre: ngp, createdBy: users.anika, status: 'PENDING_QUALITY', candidates: 55, prefix: 'SPV26', enteredHoursAgo: 2,
      approvals: [
        { by: users.meera, step: 'DISTRICT', decision: 'APPROVE' },
        { by: users.kabir, step: 'DISTRICT', decision: 'APPROVE' },
      ],
    },
    {
      course: 'Beauty Therapist', centre: ngp, createdBy: users.anika, status: 'SENT_BACK', candidates: 4, prefix: 'BTY26', enteredHoursAgo: 1,
      approvals: [{ by: users.kabir, step: 'DISTRICT', decision: 'SEND_BACK', reason: 'Two candidates have the same phone number; please check row 3.' }],
      sendBackReason: 'Two candidates have the same phone number; please check row 3.',
    },
    { course: 'Warehouse Associate', centre: amr, createdBy: users.ravi, status: 'PENDING_DISTRICT', candidates: 6, prefix: 'WHA26', enteredHoursAgo: 3 },
  ];

  let block = 100;
  for (const p of plan) {
    const isDraft = p.status === 'DRAFT';
    const entered = hoursAgo(p.enteredHoursAgo);
    const batch = await prisma.batch.create({
      data: {
        courseName: p.course,
        centre: { connect: { id: p.centre.id } },
        district: { connect: { id: p.centre.districtId } },
        createdBy: { connect: { id: p.createdBy.id } },
        status: p.status,
        revision: isDraft ? 0 : 1,
        version: 1,
        candidateCount: p.candidates,
        submittedAt: isDraft ? null : entered,
        currentStepEnteredAt: isDraft ? null : entered,
        sendBackReason: p.sendBackReason ?? null,
        candidates: {
          create: demoCandidates(p.candidates, p.prefix, block++).map((c) => ({ ...c })),
        },
      },
    });
    for (const a of p.approvals ?? []) {
      await prisma.approval.create({
        data: { batchId: batch.id, revision: 1, step: a.step, officerId: a.by.id, decision: a.decision, reason: a.reason ?? null },
      });
    }
    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorRole: 'SYSTEM',
        action: 'SEEDED',
        entityType: 'BATCH',
        entityId: batch.id,
        batchId: batch.id,
        toState: p.status,
        metadata: { note: 'Created by the demo seed script' },
        correlationId: 'seed',
      },
    });
  }
  return plan.length;
}
