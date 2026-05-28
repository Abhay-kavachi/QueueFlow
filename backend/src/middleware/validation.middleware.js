const Joi = require('joi');


const userRequestSchema = Joi.object({
  identifier: Joi.string().min(4).max(20).required(), 
  orgId: Joi.string().uuid().required(),
  serviceId: Joi.number().integer().positive().required()
});


function validateInput(schema) {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({ error: 'Invalid input data', details: error.details.map(err => err.message) });
    }
    next();
  };
}

module.exports = { userRequestSchema, validateInput };
