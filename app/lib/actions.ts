'use server';

import { sql } from '@vercel/postgres';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { revalidateRedirectPath } from './utils';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

export type State = {
  id?: string;
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater than $0.' }),

  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status.',
  }),
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

const validateInvoiceForms = (formData?: FormData) => {
  // Validate form fields using Zod
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData?.get('customerId'),
    amount: formData?.get('amount'),
    status: formData?.get('status'),
  });

  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }

  return null;
};

export async function createInvoice(prevState?: State, formData?: FormData) {
  try {
    const validationError = validateInvoiceForms(formData);

    if (validationError) return validationError;

    const { customerId, amount, status } = CreateInvoice.parse({
      customerId: formData?.get('customerId'),
      amount: formData?.get('amount'),
      status: formData?.get('status'),
    });
    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];

    await sql`
          INSERT INTO invoices (customer_id, amount, status, date)
          VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
        `;
  } catch (error) {
    return {
      message: 'Something went wrong',
    };
  }

  revalidateRedirectPath('/dashboard/invoices');
}

export async function updateInvoice(
  id?: string,
  prevState?: State,
  formData?: FormData,
) {
  try {
    const validationError = validateInvoiceForms(formData);

    if (validationError) return validationError;

    const { customerId, amount, status } = UpdateInvoice.parse({
      customerId: formData?.get('customerId'),
      amount: formData?.get('amount'),
      status: formData?.get('status'),
    });

    const amountInCents = amount * 100;

    await sql`
              UPDATE invoices
              SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
              WHERE id = ${id}
            `;
  } catch (error) {
    return {
      message: 'Somethign went wrong',
    };
  }

  revalidateRedirectPath('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
    revalidatePath('/dashboard/invoices');
    return { message: 'Deleted Invoice.' };
  } catch (error) {
    return {
      message: 'Something went wrong',
    };
  }
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}
