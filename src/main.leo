// Simplified zk_invoice program for Aleo testnet deployment
// Optimized version without async/finalize/mappings to meet testnet constraints
// All state is managed through records (UTXO-style)

program zk_invoice.aleo {

    // ========== Program lifecycle ==========
    @noupgrade
    async constructor() {}

    // ========== Status constants ==========
    const STATUS_PENDING: u8 = 0u8;
    const STATUS_PAID: u8 = 1u8;
    const STATUS_CANCELLED: u8 = 2u8;
    const STATUS_EXPIRED: u8 = 3u8;

    // ========== Struct definitions ==========
    struct InvoiceData {
        seller: address,
        buyer: address,
        amount: u64,
        due_date: u32,
        invoice_number: field
    }

    struct PaymentData {
        invoice_id: field,
        payer: address,
        payee: address,
        payment_nonce: field
    }

    // ========== Record definitions ==========
    record InvoiceRecord {
        owner: address,        // Record holder (seller or buyer)
        invoice_id: field,     // Unique invoice identifier
        seller: address,       // Seller address
        buyer: address,        // Buyer address
        amount: u64,           // Amount in microcredits
        invoice_hash: field,   // Hash of invoice details
        due_date: u32,         // Due date timestamp
        created_at: u32,       // Creation timestamp
        status: u8             // 0=PENDING, 1=PAID, 2=CANCELLED, 3=EXPIRED
    }

    record PaymentRecord {
        owner: address,        // Receipt holder
        payment_id: field,     // Unique payment identifier
        invoice_id: field,     // Related invoice ID
        payer: address,        // Payer address
        payee: address,        // Payee address
        amount: u64,           // Payment amount
        paid_at: u32           // Payment timestamp
    }

    // ========== Core Transitions ==========

    // Create invoice - returns two records (one for seller, one for buyer)
    transition create_invoice(
        buyer: address,
        amount: u64,
        due_date: u32,
        invoice_hash: field,
        nonce: field
    ) -> (InvoiceRecord, InvoiceRecord) {
        let seller: address = self.caller;

        // Validation: seller and buyer must be different
        assert_neq(seller, buyer);

        // Validation: amount must be positive
        assert(amount > 0u64);

        // Generate unique invoice_id using BHP256 hash
        let invoice_data: InvoiceData = InvoiceData {
            seller: seller,
            buyer: buyer,
            amount: amount,
            due_date: due_date,
            invoice_number: nonce
        };
        let invoice_id: field = BHP256::hash_to_field(invoice_data);

        // Create seller's invoice record
        let seller_record: InvoiceRecord = InvoiceRecord {
            owner: seller,
            invoice_id: invoice_id,
            seller: seller,
            buyer: buyer,
            amount: amount,
            invoice_hash: invoice_hash,
            due_date: due_date,
            created_at: 0u32,  // Set by frontend
            status: STATUS_PENDING
        };

        // Create buyer's invoice record
        let buyer_record: InvoiceRecord = InvoiceRecord {
            owner: buyer,
            invoice_id: invoice_id,
            seller: seller,
            buyer: buyer,
            amount: amount,
            invoice_hash: invoice_hash,
            due_date: due_date,
            created_at: 0u32,  // Set by frontend
            status: STATUS_PENDING
        };

        return (seller_record, buyer_record);
    }

    // Verify invoice hash
    transition verify_invoice(
        invoice: InvoiceRecord,
        expected_hash: field
    ) -> bool {
        return invoice.invoice_hash == expected_hash;
    }

    // Mark invoice as paid and generate payment receipt
    // Note: Actual payment must be done via credits.aleo/transfer_private first
    // This function only generates the payment receipt after verification
    transition mark_as_paid(
        invoice: InvoiceRecord,
        payment_nonce: field
    ) -> (PaymentRecord, InvoiceRecord) {
        let payer: address = self.caller;

        // Validation: only buyer can mark as paid
        assert_eq(payer, invoice.buyer);

        // Validation: invoice must be in PENDING status
        assert_eq(invoice.status, STATUS_PENDING);

        // Generate payment ID using hash
        let payment_data: PaymentData = PaymentData {
            invoice_id: invoice.invoice_id,
            payer: payer,
            payee: invoice.seller,
            payment_nonce: payment_nonce
        };
        let payment_id: field = BHP256::hash_to_field(payment_data);

        // Create payment receipt for buyer
        let receipt: PaymentRecord = PaymentRecord {
            owner: payer,
            payment_id: payment_id,
            invoice_id: invoice.invoice_id,
            payer: payer,
            payee: invoice.seller,
            amount: invoice.amount,
            paid_at: 0u32  // Set by frontend
        };

        // Update invoice status to PAID
        let updated_invoice: InvoiceRecord = InvoiceRecord {
            owner: invoice.owner,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_PAID
        };

        return (receipt, updated_invoice);
    }

    // Generate seller's payment receipt
    // Called by seller after receiving payment confirmation
    transition create_seller_receipt(
        invoice_id: field,
        payer: address,
        payee: address,
        amount: u64,
        payment_nonce: field
    ) -> PaymentRecord {
        let seller: address = self.caller;

        // Validation: caller must be the payee
        assert_eq(seller, payee);

        // Generate payment ID (must match buyer's)
        let payment_data: PaymentData = PaymentData {
            invoice_id: invoice_id,
            payer: payer,
            payee: payee,
            payment_nonce: payment_nonce
        };
        let payment_id: field = BHP256::hash_to_field(payment_data);

        // Create payment receipt for seller
        let receipt: PaymentRecord = PaymentRecord {
            owner: seller,
            payment_id: payment_id,
            invoice_id: invoice_id,
            payer: payer,
            payee: payee,
            amount: amount,
            paid_at: 0u32  // Set by frontend
        };

        return receipt;
    }

    // Cancel invoice (only seller can cancel PENDING invoices)
    transition cancel_invoice(
        invoice: InvoiceRecord
    ) -> InvoiceRecord {
        let caller: address = self.caller;

        // Validation: only seller can cancel
        assert_eq(caller, invoice.seller);

        // Validation: can only cancel PENDING invoices
        assert_eq(invoice.status, STATUS_PENDING);

        // Return cancelled invoice record
        let cancelled_invoice: InvoiceRecord = InvoiceRecord {
            owner: invoice.owner,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_CANCELLED
        };

        return cancelled_invoice;
    }

    // Verify payment receipt matches invoice
    transition verify_payment(
        receipt: PaymentRecord,
        invoice: InvoiceRecord
    ) -> bool {
        // Check if invoice_id matches
        let matches_invoice: bool = receipt.invoice_id == invoice.invoice_id;

        // Check if amount matches
        let matches_amount: bool = receipt.amount == invoice.amount;

        // Check if parties match
        let matches_parties: bool = (receipt.payer == invoice.buyer) && (receipt.payee == invoice.seller);

        return matches_invoice && matches_amount && matches_parties;
    }
}
