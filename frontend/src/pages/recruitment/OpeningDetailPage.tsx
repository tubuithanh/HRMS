import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ActionButton, Card, ErrorBox, FieldDef, FormModal, Loading, PageHeader } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, dateTime, labels } from '../../lib/format';
import { JobApplication, JobOpening, OrgUnit, Stage } from '../../types/models';
import { OpeningStatusBadge, openingFields } from './RecruitmentPage';

const STAGES: Stage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];
const NEXT: Partial<Record<Stage, Stage>> = { APPLIED: 'SCREENING', SCREENING: 'INTERVIEW', INTERVIEW: 'OFFER' };

const applicationFields: FieldDef[] = [
  { name: 'fullName', label: 'Họ tên', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Điện thoại' },
  { name: 'source', label: 'Nguồn', placeholder: 'Website, giới thiệu, TopCV…' },
  { name: 'cvUrl', label: 'Link CV', full: true },
  { name: 'note', label: 'Ghi chú', type: 'textarea' },
];

const editApplicationFields: FieldDef[] = [
  { name: 'stage', label: 'Vòng', type: 'select', options: STAGES.filter((s) => s !== 'HIRED').map((s) => ({ value: s, label: labels.stage[s] })) },
  { name: 'interviewAt', label: 'Lịch phỏng vấn', type: 'datetime', nullable: true },
  { name: 'rating', label: 'Đánh giá (1–5)', type: 'number', nullable: true },
  { name: 'note', label: 'Ghi chú', type: 'textarea', nullable: true },
];

type Dialog = 'add' | 'edit-opening' | { edit: JobApplication } | { hire: JobApplication } | null;

export default function OpeningDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const openings = useFetch<JobOpening[]>('/recruitment/openings');
  const apps = useFetch<JobApplication[]>(`/recruitment/applications?jobOpeningId=${id}`);
  const org = useFetch<OrgUnit[]>('/corehr/org');
  const [dialog, setDialog] = useState<Dialog>(null);
  const opening = openings.data?.find((o) => o.id === id);

  if (openings.loading && !openings.data) return <Loading />;
  if (!opening) return <ErrorBox error={openings.error ?? 'Không tìm thấy tin tuyển dụng'} />;

  const done = () => {
    setDialog(null);
    apps.reload();
    openings.reload();
  };
  const move = (a: JobApplication, stage: Stage) => api.patch(`/recruitment/applications/${a.id}`, { stage });

  return (
    <>
      <div className="muted" style={{ marginBottom: 6 }}>
        <Link to="/recruitment">← Tuyển dụng</Link>
      </div>
      <PageHeader
        title={opening.title}
        subtitle={
          <>
            {opening.code} · {opening.orgStructure?.name ?? 'Chưa chọn phòng ban'} · cần {opening.quantity} · đã nhận{' '}
            {opening.stageCounts.HIRED ?? 0} · <OpeningStatusBadge status={opening.status} />
          </>
        }
        actions={
          <>
            <button className="btn btn-outline-secondary" onClick={() => setDialog('edit-opening')}>Sửa tin</button>
            <ActionButton
              label="Xoá tin"
              className="btn btn-outline-danger"
              confirm="Xoá tin tuyển dụng này?"
              run={() => api.delete(`/recruitment/openings/${opening.id}`)}
              success="Đã xoá tin"
              onDone={() => navigate('/recruitment')}
            />
            {opening.status !== 'CLOSED' && (
              <button className="btn btn-primary" onClick={() => setDialog('add')}>+ Ứng viên</button>
            )}
          </>
        }
      />
      {opening.description && <Card><div style={{ whiteSpace: 'pre-wrap' }}>{opening.description}</div></Card>}
      <ErrorBox error={apps.error} />
      <div className="kanban" style={{ marginTop: 16 }}>
        {STAGES.map((stage) => {
          const list = apps.data?.filter((a) => a.stage === stage) ?? [];
          return (
            <div key={stage} className="kanban-col">
              <h3>
                {labels.stage[stage]} <span className="muted">{list.length}</span>
              </h3>
              {list.map((a) => (
                <div key={a.id} className="kanban-card">
                  <strong>{a.fullName}</strong>
                  {a.rating && <span className="muted"> · {'★'.repeat(a.rating)}</span>}
                  <div className="muted" style={{ fontSize: 12 }}>
                    {[a.email, a.phone].filter(Boolean).join(' · ') || 'Chưa có liên hệ'}
                  </div>
                  {a.source && <div className="muted" style={{ fontSize: 12 }}>Nguồn: {a.source}</div>}
                  {a.interviewAt && <div style={{ fontSize: 12 }}>PV: {dateTime(a.interviewAt)}</div>}
                  {a.cvUrl && <div style={{ fontSize: 12 }}><a href={a.cvUrl} target="_blank" rel="noreferrer">Xem CV</a></div>}
                  {a.note && <div style={{ fontSize: 12, marginTop: 4 }}>{a.note}</div>}
                  {a.hiredPerson && (
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      → <Link to={`/persons/${a.hiredPerson.id}`}>{a.hiredPerson.personCode}</Link>
                    </div>
                  )}
                  {stage !== 'HIRED' && (
                    <div className="toolbar" style={{ marginTop: 8 }}>
                      {NEXT[stage] && (
                        <ActionButton label={`→ ${labels.stage[NEXT[stage]!]}`} run={() => move(a, NEXT[stage]!)} onDone={done} />
                      )}
                      {stage === 'OFFER' && (
                        <button className="btn btn-sm btn-primary" onClick={() => setDialog({ hire: a })}>Nhận việc</button>
                      )}
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog({ edit: a })}>Sửa</button>
                      {stage !== 'REJECTED' && (
                        <ActionButton label="Loại" className="btn btn-sm btn-outline-danger" run={() => move(a, 'REJECTED')} onDone={done} />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="muted">Hạn nộp: {date(opening.closeDate)}. Ứng viên nhận việc sẽ được tạo hồ sơ nhân sự; sau đó thêm hợp đồng lao động ở trang Nhân sự.</p>

      {dialog === 'add' && (
        <FormModal
          title="Thêm ứng viên"
          fields={applicationFields}
          path="/recruitment/applications"
          transform={(b) => ({ ...b, jobOpeningId: opening.id })}
          onClose={() => setDialog(null)}
          onSaved={done}
        />
      )}
      {dialog === 'edit-opening' && (
        <FormModal title="Sửa tin tuyển dụng" fields={openingFields(org.data ?? [], true)} initial={opening} method="patch" path={`/recruitment/openings/${opening.id}`} onClose={() => setDialog(null)} onSaved={done} />
      )}
      {dialog && typeof dialog === 'object' && 'edit' in dialog && (
        <FormModal title={dialog.edit.fullName} fields={editApplicationFields} initial={dialog.edit} method="patch" path={`/recruitment/applications/${dialog.edit.id}`} onClose={() => setDialog(null)} onSaved={done} />
      )}
      {dialog && typeof dialog === 'object' && 'hire' in dialog && (
        <FormModal
          title={`Nhận việc: ${dialog.hire.fullName}`}
          fields={[{ name: 'personCode', label: 'Mã người cho hồ sơ nhân sự mới', required: true }]}
          path={`/recruitment/applications/${dialog.hire.id}/hire`}
          submitLabel="Tạo hồ sơ nhân sự"
          successMessage="Đã tạo hồ sơ nhân sự"
          onClose={() => setDialog(null)}
          onSaved={(res) => {
            const p = (res as JobApplication).hiredPerson;
            if (p) navigate(`/persons/${p.id}`);
            else done();
          }}
        />
      )}
    </>
  );
}
