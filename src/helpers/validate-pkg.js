import validateProjectName from 'validate-npm-package-name'

/**
 * Validates an npm project name
 * @param {string} name 
 * @returns { valid: boolean, problems?: string[] }
 */
const validateNpmName = (name) => {
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