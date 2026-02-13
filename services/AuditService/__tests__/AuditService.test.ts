import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditService, AuditServiceDependencies } from '../AuditServiceImpl';
import { AuditServiceError, AuditError } from '../IAuditService';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import type { Invoice, InvoiceDetails, AleoAddress, AleoField, AuditPackage } from '@/lib/types';
import { InvoiceStatus } from '@/lib/types';

describe('AuditService', () => {
  let service: AuditService;
  let mockDeps: AuditServiceDependencies;
  let mockInvoice: Invoice;

  beforeEach(async () => {
    const details: InvoiceDetails = {
      invoiceNumber: 'INV-001',
      lineItems: [
        { description: 'Service A', quantity: 1, unitPrice: 100, amount: 100 }
      ],
      subtotal: 100,
      taxRate: 0.1,
      taxAmount: 10,
      total: 110,
      currency: 'USD'
    };

    // Use real hash of details so generate->validate integrity check passes
    const cryptoService = new CryptoService();
    const invoiceHash = (await cryptoService.computeInvoiceHash(details)) as AleoField;

    // Create mock invoice with details
    mockInvoice = {
      id: '12345field' as AleoField,
      invoiceHash,
      seller: 'aleo1seller' as AleoAddress,
      buyer: 'aleo1buyer' as AleoAddress,
      amount: 1000000n,
      dueDate: new Date(Date.now() + 86400000),
      status: InvoiceStatus.PENDING,
      createdAt: new Date(),
      details
    };

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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
      expect(result.pkg.invoiceId).toBe('12345field');
      expect(result.pkg.auditorAddress).toBe('aleo1auditor');
      expect(result.pkg.permissions).toEqual(['READ_AMOUNT', 'READ_PARTIES', 'READ_DETAILS']);
      expect(result.pkg.signerAddress).toBe('aleo1signer');
      
      // Type guard to check V2 specific fields
      if (result.pkg.version === 2) {
        expect(result.pkg.chainVerifiable).toBe(true);
        expect(result.pkg.programId).toBeDefined();
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
        auditorAddress: 'aleo1auditor' as AleoAddress,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act
      const result = await service.generate(params);

      // Assert
      expect(result).toBeDefined();
      expect(result.pkg.invoiceId).toBe('12345field'); // Should use actual invoice id
    });

    it('should generate different audit keys for each call', async () => {
      // Arrange
      const params = {
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        auditorAddress: 'aleo1auditor' as AleoAddress,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act & Assert
      await expect(service.generate(params)).rejects.toThrow('Invoice ID is required');
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);
    });

    it('should throw INVALID_INPUT error for empty auditorAddress', async () => {
      // Arrange
      const params = {
        invoiceId: '12345field' as AleoField,
        auditorAddress: '' as AleoAddress,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act & Assert
      await expect(service.generate(params)).rejects.toThrow('Auditor address is required');
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);
      
      try {
        await service.generate(params);
      } catch (error: any) {
        expect(error.code).toBe(AuditError.INVALID_INPUT);
      }
    });

    it('should throw NOT_CONNECTED error when wallet is not connected', async () => {
      // Arrange
      const serviceWithoutWallet = new AuditService({
        signerAddress: null,
        getAllInvoices: mockDeps.getAllInvoices,
        signMessage: mockDeps.signMessage
      });

      const params = {
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act
      const result = await service.generate(params);

      // Assert
      expect(result.pkg.programId).toBeDefined();
      expect(result.pkg.programId).toMatch(/\.aleo$/);
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
  });

  describe('validate', () => {
    it('should validate a legitimate audit package', async () => {
      // Arrange - Generate a real package first
      const generateParams = {
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
      // Arrange - Create invalid package
      const invalidPackage: any = {
        version: 2,
        // Missing required fields
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
  });

  describe('error handling', () => {
    it('should throw AuditServiceError type for all errors', async () => {
      // Test various error scenarios
      const scenarios = [
        {
          name: 'empty invoiceId',
          params: {
            invoiceId: '' as AleoField,
            auditorAddress: 'aleo1auditor' as AleoAddress,
            expiresAt: Date.now() + 1000,
            permissions: ['READ_AMOUNT']
          }
        },
        {
          name: 'empty auditorAddress',
          params: {
            invoiceId: '12345field' as AleoField,
            auditorAddress: '' as AleoAddress,
            expiresAt: Date.now() + 1000,
            permissions: ['READ_AMOUNT']
          }
        }
      ];

      for (const scenario of scenarios) {
        try {
          await service.generate(scenario.params);
          fail(`Should have thrown for: ${scenario.name}`);
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act & Assert
      try {
        await service.generate(params);
        fail('Should have thrown');
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
        invoiceId: '12345field' as AleoField,
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
        auditorAddress: 'aleo1auditor' as AleoAddress,
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
