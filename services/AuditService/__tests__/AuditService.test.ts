import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditService, AuditServiceDependencies } from '../AuditServiceImpl';
import { AuditServiceError, AuditError } from '../IAuditService';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import type { Invoice, InvoiceDetails, AleoAddress, AleoField } from '@/lib/types';
import { InvoiceStatus } from '@/lib/types';
import { PROGRAM_ID } from '@/lib/contract';

describe('AuditService', () => {
  let service: AuditService;
  let mockDeps: AuditServiceDependencies;
  let mockInvoice: Invoice;

  beforeEach(async () => {
    // Off-chain details (for audit decryption and frontend display, corresponding to InvoiceDetails)
    const details: InvoiceDetails = {
      invoiceNumber: 'INV-2026-001',
      lineItems: [
        {
          description: 'Advanced Cloud Service',
          quantity: 1,
          unitPrice: 1000000,
          amount: 1000000
        }
      ],
      subtotal: 1000000,
      taxRate: 0.13,
      taxAmount: 130000,
      total: 1130000,
      currency: 'USD',
      notes: 'Service period: Feb 2026'
    };

    // Use real hash of details so generate->validate integrity check passes
    const cryptoService = new CryptoService();
    const invoiceHash = (await cryptoService.computeInvoiceHash(details)) as AleoField;

    // Mock invoice aligned with main.leo InvoiceRecord structure
    mockInvoice = {
      // 1. Basic Record fields (strictly corresponding to InvoiceRecord struct in main.leo)
      id: '50231998723415field' as AleoField,
      owner: 'aleo1seller1234567890abcdefghijk' as AleoAddress,
      seller: 'aleo1seller1234567890abcdefghijk' as AleoAddress,
      buyer: 'aleo1buyer1234567890abcdefghijk' as AleoAddress,

      // 2. Financial details (for R1-R5 rule validation)
      amount: 1000000n,
      taxAmount: 130000n,

      // 3. Time and business identifiers (u32 Unix second timestamps -> Date)
      dueDate: new Date(1798761600 * 1000), // 2026-12-31
      createdAt: new Date(1739520000 * 1000), // 2026-02-14

      // 4. Hash anchors (critical for audit verification)
      invoiceHash,
      itemsHash: '111222333field' as AleoField,
      memoHash: '444555666field' as AleoField,
      orderId: '8888888field' as AleoField,
      currency: '8483728field' as AleoField,

      // 5. Status and extensions
      status: InvoiceStatus.PENDING,

      // 6. Additional business fields (not in contract Record, but needed for AuditPackage generation)
      nonce: '123456789field' as AleoField,

      // 7. Off-chain details (for frontend display after audit decryption)
      details
    } as Invoice;

    // Mock dependencies
    mockDeps = {
      signerAddress: 'aleo1signer' as AleoAddress,
      getAllInvoices: vi.fn().mockResolvedValue([mockInvoice]),
      signMessage: vi.fn().mockResolvedValue('mock-signature-12345'),
      protocolService: {
        verifyInvoiceOnChain: vi.fn().mockResolvedValue({
          exists: true,
          hashMatch: true,
          chainStatus: null
        })
      } as any
    };

    // Create service instance
    service = new AuditService(mockDeps);
  });

  describe('generate', () => {
    it('should successfully generate an audit package with valid inputs', async () => {
      // Arrange
      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT', 'READ_PARTIES', 'READ_DETAILS']
      };

      // Act
      const result = await service.generate(params);

      // Assert
      expect(result).toBeDefined();
      expect(result.pkg).toBeDefined();
      expect(result.auditKey).toBeDefined();

      // Verify audit package structure
      expect(result.pkg.version).toBe(2);
      expect(result.pkg.invoiceId).toBe('50231998723415field');
      expect(result.pkg.permissions).toEqual(['READ_AMOUNT', 'READ_PARTIES', 'READ_DETAILS']);
      expect(result.pkg.signerAddress).toBe('aleo1signer');
      
      // Type guard to check V2 specific fields
      if (result.pkg.version === 2) {
        expect(result.pkg.chainVerifiable).toBe(true);
        expect(result.pkg.programId).toBeDefined();
        expect(result.pkg.programId).toBe(PROGRAM_ID);
      }

      // Verify cipher
      expect(result.pkg.cipher).toBeDefined();
      expect(result.pkg.cipher.iv).toBeTruthy();
      expect(result.pkg.cipher.ciphertext).toBeTruthy();

      // Verify cipher hash
      expect(result.pkg.cipherHash).toBeDefined();
      expect(result.pkg.cipherHash).toMatch(/^[0-9a-f]{64}$/);

      // Verify signature
      expect(result.pkg.signature).toBe('mock-signature-12345');

      // Verify audit key
      expect(result.auditKey).toMatch(/^[0-9a-f]{64}$/);

      // Verify dependencies were called
      expect(mockDeps.signMessage).toHaveBeenCalledTimes(2); // Once for master key, once for package
      expect(mockDeps.getAllInvoices).toHaveBeenCalledWith({
        masterKey: expect.any(String),
        refreshMemory: false
      });
    });

    it('should find invoice by invoiceHash if id does not match', async () => {
      // Arrange - pass invoiceHash instead of id; service should find by hash and use actual id in package
      const params = {
        invoiceId: mockInvoice.invoiceHash,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act
      const result = await service.generate(params);

      // Assert
      expect(result).toBeDefined();
      expect(result.pkg.invoiceId).toBe('50231998723415field'); // Should use actual invoice id
    });

    it('should generate different audit keys for each call', async () => {
      // Arrange
      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act
      const result1 = await service.generate(params);
      const result2 = await service.generate(params);

      // Assert
      expect(result1.auditKey).not.toBe(result2.auditKey);
    });

    it('should throw INVALID_INPUT error for empty invoiceId', async () => {
      // Arrange
      const params = {
        invoiceId: '' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act & Assert
      await expect(service.generate(params)).rejects.toThrow('Invoice ID is required');
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);
      
      try {
        await service.generate(params);
      } catch (error: any) {
        expect(error.code).toBe(AuditError.INVALID_INPUT);
      }
    });

    it('should throw INVALID_INPUT error for whitespace-only invoiceId', async () => {
      // Arrange
      const params = {
        invoiceId: '   ' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act & Assert
      await expect(service.generate(params)).rejects.toThrow('Invoice ID is required');
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);
    });

    it('should throw NOT_CONNECTED error when wallet is not connected', async () => {
      // Arrange
      const serviceWithoutWallet = new AuditService({
        signerAddress: null,
        getAllInvoices: mockDeps.getAllInvoices,
        signMessage: mockDeps.signMessage
      });

      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act & Assert
      await expect(serviceWithoutWallet.generate(params)).rejects.toThrow('Wallet not connected');
      await expect(serviceWithoutWallet.generate(params)).rejects.toThrow(AuditServiceError);
      
      try {
        await serviceWithoutWallet.generate(params);
      } catch (error: any) {
        expect(error.code).toBe(AuditError.NOT_CONNECTED);
      }
    });

    it('should throw INVOICE_NOT_FOUND error when invoice does not exist', async () => {
      // Arrange
      mockDeps.getAllInvoices = vi.fn().mockResolvedValue([]); // Empty invoice list
      service = new AuditService(mockDeps);

      const params = {
        invoiceId: 'nonexistent-id' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act & Assert
      await expect(service.generate(params)).rejects.toThrow('Invoice not found in local storage');
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);
      
      try {
        await service.generate(params);
      } catch (error: any) {
        expect(error.code).toBe(AuditError.INVOICE_NOT_FOUND);
      }
    });

    it('should throw MISSING_DETAILS error when invoice has no details', async () => {
      // Arrange
      const invoiceWithoutDetails = { ...mockInvoice, details: undefined };
      mockDeps.getAllInvoices = vi.fn().mockResolvedValue([invoiceWithoutDetails]);
      service = new AuditService(mockDeps);

      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act & Assert
      await expect(service.generate(params)).rejects.toThrow('Invoice details are missing');
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);
      
      try {
        await service.generate(params);
      } catch (error: any) {
        expect(error.code).toBe(AuditError.MISSING_DETAILS);
      }
    });

    it('should throw INVALID_INPUT error when no permissions result in data', async () => {
      // Arrange
      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: [] // Empty permissions - no data will be selected
      };

      // Act & Assert
      await expect(service.generate(params)).rejects.toThrow('No data selected for disclosure');
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);
      
      try {
        await service.generate(params);
      } catch (error: any) {
        expect(error.code).toBe(AuditError.INVALID_INPUT);
      }
    });

    it('should handle READ_AMOUNT permission only', async () => {
      // Arrange
      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act
      const result = await service.generate(params);

      // Assert
      expect(result.pkg.permissions).toEqual(['READ_AMOUNT']);
    });

    it('should handle READ_PARTIES permission only', async () => {
      // Arrange
      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_PARTIES']
      };

      // Act
      const result = await service.generate(params);

      // Assert
      expect(result.pkg.permissions).toEqual(['READ_PARTIES']);
    });

    it('should handle READ_DETAILS permission', async () => {
      // Arrange
      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_DETAILS']
      };

      // Act
      const result = await service.generate(params);

      // Assert
      expect(result.pkg.permissions).toEqual(['READ_DETAILS']);
    });

    it('should handle multiple permissions', async () => {
      // Arrange
      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT', 'READ_PARTIES', 'READ_DETAILS', 'READ_LINE_ITEMS']
      };

      // Act
      const result = await service.generate(params);

      // Assert
      expect(result.pkg.permissions).toEqual(['READ_AMOUNT', 'READ_PARTIES', 'READ_DETAILS', 'READ_LINE_ITEMS']);
    });

    it('should throw GENERATION_FAILED when signMessage fails', async () => {
      // Arrange
      mockDeps.signMessage = vi.fn().mockRejectedValue(new Error('Signature failed'));
      service = new AuditService(mockDeps);

      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act & Assert
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);
      
      try {
        await service.generate(params);
      } catch (error: any) {
        expect(error.code).toBe(AuditError.GENERATION_FAILED);
      }
    });

    it('should throw GENERATION_FAILED when getAllInvoices fails', async () => {
      // Arrange
      mockDeps.getAllInvoices = vi.fn().mockRejectedValue(new Error('Database error'));
      service = new AuditService(mockDeps);

      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act & Assert
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);
      
      try {
        await service.generate(params);
      } catch (error: any) {
        expect(error.code).toBe(AuditError.GENERATION_FAILED);
      }
    });

    it('should include issuedAt timestamp in the package', async () => {
      // Arrange
      const beforeTime = Date.now();
      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act
      const result = await service.generate(params);
      const afterTime = Date.now();

      // Assert
      expect(result.pkg.issuedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(result.pkg.issuedAt).toBeLessThanOrEqual(afterTime);
    });

    it('should set correct programId', async () => {
      // Arrange
      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act
      const result = await service.generate(params);

      // Assert (V2 package has programId)
      expect(result.pkg.version).toBe(2);
      if (result.pkg.version === 2) {
        expect(result.pkg.programId).toBeDefined();
        expect(result.pkg.programId).toBe(PROGRAM_ID);
        expect(result.pkg.programId).toMatch(/\.aleo$/);
      }
    });

    it('should handle complex invoice with multiple line items', async () => {
      // Arrange
      const complexInvoice: Invoice = {
        ...mockInvoice,
        details: {
          invoiceNumber: 'INV-COMPLEX-001',
          lineItems: [
            { description: 'Product A', quantity: 5, unitPrice: 123.45, amount: 617.25 },
            { description: 'Product B', quantity: 3, unitPrice: 67.89, amount: 203.67 },
            { description: 'Service C', quantity: 1, unitPrice: 500, amount: 500 }
          ],
          subtotal: 1320.92,
          taxRate: 0.13,
          taxAmount: 171.72,
          total: 1492.64,
          currency: 'CAD',
          notes: 'Complex invoice with multiple items'
        }
      };

      mockDeps.getAllInvoices = vi.fn().mockResolvedValue([complexInvoice]);
      service = new AuditService(mockDeps);

      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_DETAILS']
      };

      // Act
      const result = await service.generate(params);

      // Assert
      expect(result).toBeDefined();
      expect(result.pkg).toBeDefined();
      expect(result.auditKey).toBeDefined();
    });

    it('should use same master key derivation message format', async () => {
      // Arrange
      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act
      await service.generate(params);

      // Assert
      expect(mockDeps.signMessage).toHaveBeenCalledWith(
        expect.stringContaining('Derive master key for Aleo address:')
      );
    });

    it('should call buildAuditMessage with canonical format: AUDIT_PACKAGE_V2|programId|invoiceId|invoiceHash|expiresAt|sortedPerms|cipherHash', async () => {
      const expiresAt = Date.now() + 60_000;
      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt,
        permissions: ['READ_DETAILS', 'READ_AMOUNT']
      };

      await service.generate(params);

      const signCalls = (mockDeps.signMessage as ReturnType<typeof vi.fn>).mock.calls;
      const packageSignCall = signCalls.find((call: string[]) =>
        call[0]?.startsWith('AUDIT_PACKAGE_V2|')
      );
      expect(packageSignCall).toBeDefined();

      const message = packageSignCall[0];
      const parts = message.split('|');
      expect(parts[0]).toBe('AUDIT_PACKAGE_V2');
      expect(parts[1]).toBe(PROGRAM_ID);
      expect(parts[2]).toBe('50231998723415field');
      expect(Number(parts[4])).toBe(expiresAt);
      expect(parts[5]).toBe('READ_AMOUNT,READ_DETAILS');
      expect(parts[6]).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should filter by READ_DETAILS: decrypted includes full details with lineItems', async () => {
      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 60_000,
        permissions: ['READ_DETAILS', 'READ_AMOUNT', 'READ_LINE_ITEMS']
      };

      const generated = await service.generate(params);
      const result = await service.validate(generated.pkg, generated.auditKey);

      expect(result.valid).toBe(true);
      expect(result.decrypted?.details).toBeDefined();
      expect(result.decrypted.details.invoiceNumber).toBe('INV-2026-001');
      expect(result.decrypted.details.lineItems).toHaveLength(1);
      expect(result.decrypted.details.lineItems[0].description).toBe('Advanced Cloud Service');
      expect(Number(result.decrypted.amount ?? 0)).toBe(1000000);
    });

    it('should filter by READ_PARTIES + READ_DETAILS: decrypted has seller, buyer and full details', async () => {
      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 60_000,
        permissions: ['READ_PARTIES', 'READ_DETAILS']
      };

      const generated = await service.generate(params);
      const result = await service.validate(generated.pkg, generated.auditKey);

      expect(result.valid).toBe(true);
      expect(result.decrypted?.seller).toBe('aleo1seller1234567890abcdefghijk');
      expect(result.decrypted?.buyer).toBe('aleo1buyer1234567890abcdefghijk');
      expect(result.decrypted?.details?.invoiceNumber).toBe('INV-2026-001');
      expect(result.decrypted?.details?.lineItems).toHaveLength(1);
    });
  });

  describe('validate', () => {
    it('should validate a legitimate audit package', async () => {
      // Arrange - Generate a real package first
      const generateParams = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT', 'READ_PARTIES', 'READ_DETAILS']
      };

      const generated = await service.generate(generateParams);

      // Act
      const result = await service.validate(generated.pkg, generated.auditKey);

      // Assert
      expect(result).toBeDefined();
      expect(result.valid).toBe(true);
      expect(result.decrypted).toBeDefined();
    });

    it('should reject package with wrong audit key', async () => {
      // Arrange - Generate a real package
      const generateParams = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      const generated = await service.generate(generateParams);
      const wrongKey = 'a'.repeat(64); // Wrong key

      // Act
      const result = await service.validate(generated.pkg, wrongKey);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should reject expired audit package', async () => {
      // Arrange - Generate package that's already expired
      const generateParams = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() - 1000, // Already expired
        permissions: ['READ_AMOUNT']
      };

      const generated = await service.generate(generateParams);

      // Act
      const result = await service.validate(generated.pkg, generated.auditKey);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should throw VALIDATION_FAILED when validation throws error', async () => {
      // Arrange - Create invalid package (V2 shape with programId but missing required fields)
      const invalidPackage: any = {
        version: 2,
        programId: PROGRAM_ID,
        // Missing required fields (invoiceId, invoiceHash, cipher, etc.)
      };

      // Act & Assert
      await expect(service.validate(invalidPackage, 'somekey')).rejects.toThrow(AuditServiceError);
      
      try {
        await service.validate(invalidPackage, 'somekey');
      } catch (error: any) {
        expect(error.code).toBe(AuditError.VALIDATION_FAILED);
      }
    });

    it('should return decrypted data for valid package', async () => {
      // Arrange
      const generateParams = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_DETAILS']
      };

      const generated = await service.generate(generateParams);

      // Act
      const result = await service.validate(generated.pkg, generated.auditKey);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.decrypted).toBeDefined();
      expect(result.decrypted.details).toBeDefined();
    });

    it('should fail when chain hash mismatch', async () => {
      const generated = await service.generate({
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 60_000,
        permissions: ['READ_DETAILS']
      });

      const depsWithHashMismatch: AuditServiceDependencies = {
        ...mockDeps,
        protocolService: {
          verifyInvoiceOnChain: vi.fn().mockResolvedValue({
            exists: true,
            hashMatch: false,
            chainStatus: InvoiceStatus.PENDING
          })
        } as any
      };
      const serviceWithMismatch = new AuditService(depsWithHashMismatch);

      const result = await serviceWithMismatch.validate(generated.pkg, generated.auditKey);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('HASH_MISMATCH_WITH_CHAIN');
    });

    it('should pass with chainVerification when chain matches', async () => {
      mockDeps.protocolService = {
        verifyInvoiceOnChain: vi.fn().mockResolvedValue({
          exists: true,
          hashMatch: true,
          chainStatus: InvoiceStatus.PAID
        })
      } as any;
      service = new AuditService(mockDeps);

      const generated = await service.generate({
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 60_000,
        permissions: ['READ_DETAILS']
      });

      const result = await service.validate(generated.pkg, generated.auditKey);

      expect(result.valid).toBe(true);
      expect(result.chainVerification?.chainStatus).toBe(InvoiceStatus.PAID);
    });

    it('should fail with cipher hash mismatch when payload is tampered', async () => {
      const generated = await service.generate({
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 60_000,
        permissions: ['READ_DETAILS']
      });

      const tamperedPkg = {
        ...generated.pkg,
        cipher: {
          ...generated.pkg.cipher,
          ciphertext: Buffer.from(generated.pkg.cipher.ciphertext, 'base64')
            .reverse()
            .toString('base64')
        }
      };

      const result = await service.validate(tamperedPkg, generated.auditKey);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Cipher hash mismatch (tampered payload)');
    });
  });

  describe('error handling', () => {
    it('should throw AuditServiceError type for all errors', async () => {
      // Test various error scenarios
      const scenarios = [
        {
          name: 'empty invoiceId',
          params: {
            invoiceId: '' as AleoField,
            expiresAt: Date.now() + 1000,
            permissions: ['READ_AMOUNT']
          }
        }
      ];

      for (const scenario of scenarios) {
        try {
          await service.generate(scenario.params);
          expect.fail(`Should have thrown for: ${scenario.name}`);
        } catch (error) {
          expect(error).toBeInstanceOf(AuditServiceError);
        }
      }
    });

    it('should preserve error details in wrapped errors', async () => {
      // Arrange
      const originalError = new Error('Original error message');
      mockDeps.getAllInvoices = vi.fn().mockRejectedValue(originalError);
      service = new AuditService(mockDeps);

      const params = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act & Assert
      try {
        await service.generate(params);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(AuditServiceError);
        expect(error.details).toBeDefined();
        expect(error.details.originalError).toContain('Original error message');
      }
    });
  });

  describe('integration', () => {
    it('should complete full generate-validate cycle', async () => {
      // Arrange
      const generateParams = {
        invoiceId: '50231998723415field' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT', 'READ_PARTIES', 'READ_DETAILS']
      };

      // Act - Generate
      const generated = await service.generate(generateParams);

      // Assert - Package structure
      expect(generated.pkg).toBeDefined();
      expect(generated.auditKey).toBeDefined();
      expect(generated.pkg.cipher).toBeDefined();
      expect(generated.pkg.cipherHash).toBeDefined();

      // Act - Validate
      const validated = await service.validate(generated.pkg, generated.auditKey);

      // Assert - Validation result
      expect(validated.valid).toBe(true);
      expect(validated.decrypted).toBeDefined();
    });

    it('should handle multiple invoices in storage', async () => {
      // Arrange
      const invoice1 = { ...mockInvoice, id: 'invoice1' as AleoField };
      const invoice2 = { ...mockInvoice, id: 'invoice2' as AleoField };
      const invoice3 = { ...mockInvoice, id: 'invoice3' as AleoField };

      mockDeps.getAllInvoices = vi.fn().mockResolvedValue([invoice1, invoice2, invoice3]);
      service = new AuditService(mockDeps);

      const params = {
        invoiceId: 'invoice2' as AleoField,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act
      const result = await service.generate(params);

      // Assert
      expect(result.pkg.invoiceId).toBe('invoice2');
    });
  });
});
