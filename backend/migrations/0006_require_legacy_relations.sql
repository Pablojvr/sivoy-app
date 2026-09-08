-- NOT VALID checks avoid a long initial table scan under an exclusive lock.
ALTER TABLE agencias
  ADD CONSTRAINT agencias_empresa_id_required CHECK (empresa_id IS NOT NULL) NOT VALID;
ALTER TABLE horarios_operativos
  ADD CONSTRAINT horarios_agencia_id_required CHECK (agencia_id IS NOT NULL) NOT VALID;
ALTER TABLE reglas_entrega
  ADD CONSTRAINT reglas_agencia_id_required CHECK (agencia_id IS NOT NULL) NOT VALID;

ALTER TABLE agencias VALIDATE CONSTRAINT agencias_empresa_id_required;
ALTER TABLE horarios_operativos VALIDATE CONSTRAINT horarios_agencia_id_required;
ALTER TABLE reglas_entrega VALIDATE CONSTRAINT reglas_agencia_id_required;

ALTER TABLE agencias ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE horarios_operativos ALTER COLUMN agencia_id SET NOT NULL;
ALTER TABLE reglas_entrega ALTER COLUMN agencia_id SET NOT NULL;

ALTER TABLE agencias DROP CONSTRAINT agencias_empresa_id_required;
ALTER TABLE horarios_operativos DROP CONSTRAINT horarios_agencia_id_required;
ALTER TABLE reglas_entrega DROP CONSTRAINT reglas_agencia_id_required;
