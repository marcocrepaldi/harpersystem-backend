-- CreateTable
CREATE TABLE "harper_app_dev"."health_beneficiary_operator" (
    "id" TEXT NOT NULL,
    "beneficiarioId" TEXT NOT NULL,
    "Empresa" TEXT,
    "Cpf" TEXT,
    "Usuario" TEXT,
    "Nm_Social" TEXT,
    "Estado_Civil" TEXT,
    "Data_Nascimento" TIMESTAMP(3),
    "Sexo" VARCHAR(1),
    "Identidade" TEXT,
    "Orgao_Exp" TEXT,
    "Uf_Orgao" TEXT,
    "Uf_Endereco" TEXT,
    "Cidade" TEXT,
    "Tipo_Logradouro" TEXT,
    "Logradouro" TEXT,
    "Numero" TEXT,
    "Complemento" TEXT,
    "Bairro" TEXT,
    "Cep" TEXT,
    "Fone" TEXT,
    "Celular" TEXT,
    "Plano" TEXT,
    "Matricula" TEXT,
    "Filial" TEXT,
    "Codigo_Usuario" TEXT,
    "Dt_Admissao" TIMESTAMP(3),
    "Codigo_Congenere" TEXT,
    "Nm_Congenere" TEXT,
    "Tipo_Usuario" TEXT,
    "Nome_Mae" TEXT,
    "Pis" TEXT,
    "Cns" TEXT,
    "Ctps" TEXT,
    "Serie_Ctps" TEXT,
    "Data_Processamento" TIMESTAMP(3),
    "Data_Cadastro" TIMESTAMP(3),
    "Unidade" TEXT,
    "Descricao_Unidade" TEXT,
    "Cpf_Dependente" TEXT,
    "Grau_Parentesco" TEXT,
    "Dt_Casamento" TIMESTAMP(3),
    "Nu_Registro_Pessoa_Natural" TEXT,
    "Cd_Tabela" TEXT,
    "Empresa_Utilizacao" TEXT,
    "Dt_Cancelamento" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_beneficiary_operator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "health_beneficiary_operator_beneficiarioId_key" ON "harper_app_dev"."health_beneficiary_operator"("beneficiarioId");

-- CreateIndex
CREATE INDEX "health_beneficiary_operator_beneficiarioId_idx" ON "harper_app_dev"."health_beneficiary_operator"("beneficiarioId");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."health_beneficiary_operator" ADD CONSTRAINT "health_beneficiary_operator_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "harper_app_dev"."health_beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
