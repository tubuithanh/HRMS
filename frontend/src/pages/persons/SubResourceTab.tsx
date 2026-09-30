import { useState } from 'react';
import { api } from '../../api/client';
import { useCanWrite } from '../../auth';
import { ActionButton, Card, DataTable, ErrorBox, FieldDef, FormModal } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date } from '../../lib/format';
import { SubResource } from './subResources';

type Row = Record<string, unknown> & { id: string };

function display(field: FieldDef | undefined, value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (field?.type === 'date') return date(String(value));
  if (field?.type === 'checkbox') return value ? 'Có' : '';
  if (field?.type === 'select') {
    return field.options?.find((o) => o.value === value)?.label ?? String(value);
  }
  return String(value);
}

/** Bảng + thêm + xoá cho một nhóm hồ sơ mở rộng của nhân sự. */
export default function SubResourceTab({ personId, config }: { personId: string; config: SubResource }) {
  const base = `/corehr/persons/${personId}/${config.path}`;
  const { data, error, loading, reload } = useFetch<Row[]>(base);
  const [adding, setAdding] = useState(false);
  const canWrite = useCanWrite('corehr');

  return (
    <Card
      flush
      title={config.title}
      actions={
        canWrite && (
          <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
            + Thêm
          </button>
        )
      }
    >
      <ErrorBox error={error} />
      <DataTable
        rows={data}
        loading={loading}
        rowKey={(r) => r.id}
        columns={[
          ...config.columns.map((name) => {
            const f = config.fields.find((x) => x.name === name);
            return { header: f?.label ?? name, cell: (r: Row) => display(f, r[name]) };
          }),
          ...(canWrite
            ? [
                {
                  header: '',
                  className: 'actions',
                  cell: (r: Row) => (
                    <ActionButton
                      label="Xoá"
                      className="btn btn-sm btn-outline-danger"
                      confirm="Xoá bản ghi này?"
                      run={() => api.delete(`${base}/${r.id}`)}
                      success="Đã xoá"
                      onDone={reload}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
      {adding && (
        <FormModal
          title={`Thêm ${config.title.toLowerCase()}`}
          fields={config.fields}
          path={base}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </Card>
  );
}
