import validateProjectName from 'validate-npm-package-name'

/**
 * Validates an npm project name
 */
const validateNpmName = (name: string): { valid: boolean; problems?: string[] } => {
  const nameValidation = validateProjectName(name)
  if (nameValidation.validForNewPackages) {
    return { valid: true }
  }

  return {
    valid: false,
    problems: [
      ...(nameValidation.errors || []),
      ...(nameValidation.warnings || []),
    ],
  }
}

export default validateNpmName