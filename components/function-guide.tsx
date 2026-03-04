export default function FunctionGuide() {
  const functions = [
    {
      name: 'create_invoice',
      icon: '✏️',
      desc: 'Create invoice',
      params: [
        { name: 'buyer', desc: 'Buyer address' },
        { name: 'amount', desc: 'Amount (microcredits)' },
        { name: 'due_date', desc: 'Due date timestamp' },
        { name: 'invoice_hash', desc: 'Invoice content hash' },
        { name: 'nonce', desc: 'Unique identifier' }
      ],
      returns: '2 InvoiceRecords (one for seller, one for buyer)',
      role: 'Seller'
    },
    {
      name: 'verify_invoice',
      icon: '✅',
      desc: 'Verify invoice hash',
      params: [
        { name: 'invoice', desc: 'InvoiceRecord' },
        { name: 'expected_hash', desc: 'Expected hash value' }
      ],
      returns: 'boolean (match status)',
      role: 'Anyone'
    },
    {
      name: 'pay_invoice_credits_private',
      icon: '💰',
      desc: 'Pay invoice (Credits / JCT public path)',
      params: [
        { name: 'invoice', desc: 'InvoiceRecord' },
        { name: 'payment_nonce', desc: 'Payment identifier' },
        { name: 'paid_at', desc: 'Payment timestamp (u32)' },
        { name: 'tx_id_hash', desc: 'Hash of transfer tx id (field)' }
      ],
      returns: 'PaymentRecord + 2 InvoiceRecords (PAID) + Future',
      role: 'Buyer',
      note: 'Credits transfer to seller in same tx or prior; currency_flag must be Credits'
    },
    {
      name: 'create_seller_receipt',
      icon: '🧾',
      desc: 'Generate seller receipt',
      params: [
        { name: 'invoice_id', desc: 'Invoice ID' },
        { name: 'payer', desc: 'Payer address' },
        { name: 'payee', desc: 'Payee address' },
        { name: 'amount', desc: 'Amount' },
        { name: 'payment_nonce', desc: 'Payment identifier' }
      ],
      returns: 'PaymentRecord (seller receipt)',
      role: 'Seller'
    },
    {
      name: 'cancel_invoice',
      icon: '❌',
      desc: 'Cancel invoice',
      params: [
        { name: 'invoice', desc: 'InvoiceRecord' }
      ],
      returns: 'Updated InvoiceRecord (status=CANCELLED)',
      role: 'Seller',
      note: 'Only for PENDING status invoices'
    },
    {
      name: 'verify_payment',
      icon: '🔍',
      desc: 'Verify payment match',
      params: [
        { name: 'receipt', desc: 'PaymentRecord' },
        { name: 'invoice', desc: 'InvoiceRecord' }
      ],
      returns: 'boolean (match status)',
      role: 'Anyone'
    }
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900">Contract Functions</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {functions.map((fn) => (
          <div
            key={fn.name}
            className="rounded-xl bg-white border border-amber-200 p-5 hover:border-amber-400 transition-colors"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="text-2xl">{fn.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-sm font-mono font-semibold text-slate-900">
                    {fn.name}
                  </code>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                    {fn.role}
                  </span>
                </div>
                <p className="text-sm text-slate-600">{fn.desc}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <div className="font-semibold text-slate-700 mb-1">Parameters:</div>
                <ul className="space-y-1 pl-3">
                  {fn.params.map((p) => (
                    <li key={p.name} className="text-slate-600">
                      <code className="text-amber-700">{p.name}</code>: {p.desc}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="font-semibold text-slate-700 mb-1">Returns:</div>
                <p className="text-slate-600 pl-3">{fn.returns}</p>
              </div>

              {fn.note && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 mt-2">
                  <span className="font-semibold text-amber-700">Note: </span>
                  <span className="text-slate-600">{fn.note}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
