import { z } from 'zod';

export const updatePersonSchema = z.object({
  fullName: z.string().min(1).max(150).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dateOfBirth: z.coerce.date().optional(),
  idNo: z.string().regex(/^\d{12}$/, 'CCCD phải gồm 12 chữ số').optional(),
  idExpiryDate: z.coerce.date().optional(),
  personalTaxCode: z.string().max(20).optional(),
  socialInsNo: z.string().max(20).optional(),
  nationality: z.string().optional(),
  isForeigner: z.boolean().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  bankAccountNo: z.string().trim().regex(/^\d{6,20}$/, 'Số tài khoản gồm 6–20 chữ số').nullable().optional(),
  bankName: z.string().trim().max(20).nullable().optional(),
  bankBranch: z.string().trim().max(100).nullable().optional(),
});

export const relativeSchema = z.object({
  relativeName: z.string().min(1).max(150),
  relationship: z.string().min(1),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  idNo: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  occupation: z.string().optional(),
  isEmergencyContact: z.boolean().optional(),
});

export const dependantSchema = z.object({
  dependantName: z.string().min(1).max(150),
  relationship: z.string().min(1),
  dateOfBirth: z.coerce.date().optional(),
  dependantTaxCode: z.string().optional(),
  deductionFromMonth: z.coerce.date().optional(),
  deductionToMonth: z.coerce.date().optional(),
});

export const educationSchema = z.object({
  schoolName: z.string().min(1),
  major: z.string().optional(),
  qualification: z.string().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  graduationYear: z.number().int().optional(),
  grade: z.string().optional(),
  isHighest: z.boolean().optional(),
});

export const certificateSchema = z.object({
  certificateName: z.string().min(1),
  issuedBy: z.string().optional(),
  issueDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  isMandatory: z.boolean().optional(),
  filePath: z.string().optional(),
});

export const experienceSchema = z.object({
  companyName: z.string().min(1),
  position: z.string().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  description: z.string().optional(),
  reasonLeave: z.string().optional(),
});

export const skillSchema = z.object({
  skillName: z.string().min(1),
  level: z.string().optional(),
});

export const documentSchema = z.object({
  documentType: z.string().min(1),
  documentNo: z.string().optional(),
  issueDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  filePath: z.string().optional(),
  fileName: z.string().optional(),
});

export const workPermitSchema = z.object({
  permitNo: z.string().optional(),
  permitType: z.enum(['NEW', 'REISSUE', 'EXTEND', 'EXEMPT']).optional(),
  positionName: z.string().optional(),
  issueDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  issuedBy: z.string().optional(),
  status: z.enum(['PREPARING', 'SUBMITTED', 'ISSUED', 'EXPIRED']).optional(),
  filePath: z.string().optional(),
});

export const residenceCardSchema = z.object({
  cardType: z.string().min(1),
  cardNo: z.string().optional(),
  issueDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  filePath: z.string().optional(),
});
