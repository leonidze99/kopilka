import type { ComponentPropsWithRef } from 'react';
import styles from './form.module.css';

/** Vertical form layout. Validation is ours (schemas), not the browser's. */
export function Form(props: ComponentPropsWithRef<'form'>) {
  return <form className={styles.form} noValidate {...props} />;
}
