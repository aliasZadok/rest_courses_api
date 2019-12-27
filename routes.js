const express = require('express');
const bcryptjs = require('bcryptjs');
const auth = require('basic-auth');
const { sequelize, models } = require('./db');
const { User, Course } = models;

const authenticateUser = async (req, res, next) => {
  let message = null;

  const credentials = auth(req);
  if (credentials) {
    const user = await User.findOne({
      where: {
        emailAddress: credentials.name
      }
    });

    if (user) {
      const authenticated = bcryptjs
        .compareSync(credentials.pass, user.password);
      if (authenticated) {
        console.log(`Authentication successful for username: ${user.emailAddress}`);

        req.currentUser = await User.findOne({
          where: {
            emailAddress: credentials.name
          },
          attributes: {
            exclude: ['password','createdAt','updatedAt']
          }
        });
      } else {
        message = `Authentication failure for username: ${user.emailAddress}`;
      }
    } else {
      message = `User not found for username: ${credentials.name}`;
    }
  } else {
    message = 'Auth header not found';
  }

  if (message) {
    console.warn(message);
    res.status(401).json({ message: 'Access Denied: ' + message });
  } else {
    next();
  }
}

const router = express.Router();

router.use(express.json());

function asyncHandler(callBack) {
  return async (req, res, next) => {
    try {
      await callBack(req, res, next);
    } catch(error){
      if (error.name === "SequelizeValidationError") {
        const errorMessages = error.errors.map(e => e.message);
        res.status(400).json({ errors: errorMessages });
      } else {
        throw error;
      }
    }
  }
}

/*
* GET /api/users 200 - Returns the currently authenticated user
*/
router.get('/users', authenticateUser, (req, res) => {
  const user = req.currentUser;
  res.status(200).json( user );
});

/*
* POST /api/users 201 - Creates a user,
* sets the Location header to "/", and returns no content
*/
router.post('/users', asyncHandler(
  async (req, res, next) => {
    const userDetail = req.body;
    const errors = [];

    if(!userDetail.firstName){
  		errors.push('Please provide a value for "First Name"');
  	}
  	if(!userDetail.lastName){
  		errors.push('Please provide a value for "Last Name"');
  	}
    if(!userDetail.emailAddress){
  		errors.push('Please provide a value for "Email"');
  	}
    if(!userDetail.password){
  		errors.push('Please provide a value for "Password"');
  	}

    if (errors.length == 0) {
      if (!Object.keys(userDetail).length) {
        await User.create( userDetail );
      } else {
        userDetail.password = bcryptjs.hashSync(userDetail.password);

        const email = await User.findOne({
          where: {
            emailAddress: userDetail.emailAddress
          }
        });

        if (!email) {
          await User.create( userDetail );
          res.status(201).location('/').end();
        } else {
          res.status(400).json({ error: 'This Email Id already exists!' });
        }
      }
    } else {
      res.status(400).json({errors})
    }

  }
));

/*
* GET /api/courses 200 - Returns a list of courses
* (including the user that owns each course)
*/
router.get('/courses', asyncHandler(
  async (req, res, next) => {
    const courses = await Course.findAll({
      include: [{
          model: User,
          as: 'userDetails',
          attributes: {
            exclude: ['password','createdAt','updatedAt']
          }
      }],
      attributes: {
        exclude: ['createdAt','updatedAt']
      }
    });
    res.status(200).json({ courses: courses });
  }
));

/*
* POST /api/courses 201 - Creates a course,
* sets the Location header to the URI for the course,
* and returns no content
*/
router.post('/courses', authenticateUser, asyncHandler(
  async (req, res, next) => {
    const courseDetail = req.body;
    courseDetail.userId = req.currentUser.id;
	const errors = [];

	if(!courseDetail.title){
		errors.push('Please provide a value for "Title"');
	}
	if(!courseDetail.description){
		errors.push('Please provide a value for "Description"');
	}

	if(errors.length == 0){
		await Course.create( courseDetail );
		res.status(201).location('/courses').end();
	} else {
		res.status(400).json({errors})
	}


  }
));

/*
* GET /api/courses/:id 200 - Returns a the course
* (including the user that owns the course) for the provided course ID
*/
router.get('/courses/:id', asyncHandler(
  async (req, res, next) => {
    const id = req.params.id;
    const course = await Course.findAll({
      where: {
        id: id
      },
      include: [{
          model: User,
          as: 'userDetails',
          attributes: {
            exclude: ['password','createdAt','updatedAt']
          }
      }],
      attributes: {
        exclude: ['createdAt','updatedAt']
      }
    });
    if (course.length !== 0) {
      res.status(200).json({ course: course });
    } else {
      res.status(404).end();
    }

  }
));

/*
* PUT /api/courses/:id 204 - Updates a course and returns no content
*/
router.put('/courses/:id', authenticateUser, asyncHandler(
  async (req, res, next) => {
    const id = req.params.id;
    const course = await Course.findByPk(id);
    const courseDetail = req.body;
    const { title, description } = req.body;
    const errors = [];

    if (req.currentUser.id === course.userId) {
      if (!title) {
        errors.push('Please provide a value for "Title"');
      }
      if (!description) {
        errors.push('Please provide a value for "Description"');
      }

      if (!errors.length) {
        await course.update( courseDetail );
        res.status(204).end();
      } else {
        res.status(400).json({ errors })
      }

    } else {
      res.status(403).end();
    }

  }
));

/*
* DELETE /api/courses/:id 204 - Deletes a course and returns no content
*/
router.delete('/courses/:id', authenticateUser, asyncHandler(
  async (req, res, next) => {
    const id = req.params.id;
    const course = await Course.findByPk(id);

    if (req.currentUser.id === course.userId) {
      await course.destroy();
      res.status(204).end();
    } else {
      res.status(403).end();
    }
  }
));

module.exports = router;
